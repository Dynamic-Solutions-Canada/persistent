/**
 * Express app wiring: security middleware, CORS, body parsing, the session
 * resolver, the API routers, and the JSON error handler. The HTTP server +
 * WebSocket hub + scheduler are started in server.ts.
 */
import { localizedError } from './lib/localized-error.js'
import { requestLocale } from './lib/request-locale.js'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { clientOrigins, env } from './lib/env.js'
import { attachUser } from './lib/auth-middleware.js'
import { HttpError } from './lib/http-error.js'
import { contentSecurityDirectives } from './lib/content-security.js'
import { describeError, logger } from './lib/logger.js'
import { looksLikeFilePath, sendMissingFile } from './lib/missing-file.js'
import { authRouter } from './routes/auth.js'
import { remindersRouter } from './routes/reminders.js'
import { sharesRouter } from './routes/shares.js'
import { assignmentsRouter } from './routes/assignments.js'
import { occurrencesRouter } from './routes/occurrences.js'
import { pushRouter } from './routes/push.js'
import { syncRouter } from './routes/sync.js'
import { appReleaseRouter } from './routes/app-release.js'
import { adminRouter } from './routes/admin.js'
import { clientUsageRouter } from './routes/client-usage.js'
import { announcementsRouter } from './routes/announcements.js'
import {
  analyticsCspSources,
  getClientAnalyticsConfig,
} from './lib/analytics.js'

export function createApp() {
  // The analytics origin joins the CSP only when Umami is configured (lib/analytics.ts).
  const analyticsSources = analyticsCspSources(env)
  const app = express()
  // Behind a reverse proxy in production: trust X-Forwarded-* for req.ip and secure cookies.
  app.set('trust proxy', 1)
  // CSP: same-origin plus the named exceptions in lib/content-security.ts.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: contentSecurityDirectives(analyticsSources),
      },
      // Google Identity Services signs in via a popup that must postMessage the
      // credential back to us; the default COOP 'same-origin' severs that link
      // (leaving a blank accounts.google.com/gsi/transform popup).
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  )
  app.use(
    cors({
      origin: clientOrigins.length > 0 ? clientOrigins : true,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '256kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  // Public: whether the web app should load the browser-only visit counter, and its settings.
  app.get('/api/analytics-config', (_request, response) => {
    response.json({ analytics: getClientAnalyticsConfig(env) })
  })

  // Resolve the session cookie into request.userId for every API request.
  app.use(attachUser)

  app.use('/api/auth', authRouter)
  app.use('/api/reminders', remindersRouter)
  app.use('/api/shares', sharesRouter)
  app.use('/api/assignments', assignmentsRouter)
  app.use('/api/occurrences', occurrencesRouter)
  app.use('/api/push', pushRouter)
  app.use('/api/sync', syncRouter)
  app.use('/api/app', appReleaseRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/client-usage', clientUsageRouter)
  app.use('/api/announcements', announcementsRouter)

  // 404 for unknown API routes.
  app.use('/api', (request, response) => {
    response
      .status(404)
      .json(localizedError('Not found.', requestLocale(request)))
  })

  // In production, serve the built web app from the same origin (no CORS, cookies
  // are first-party). The service worker is served with no-cache so updates land.
  const webDir = env.WEB_DIST_DIR?.trim()
  if (webDir && existsSync(webDir)) {
    // Serve the passkey asset-links with an EXACT `application/json` content type
    // (no charset). Play Services' on-device Digital Asset Links validator is
    // stricter than Google's crawler and rejects `application/json; charset=utf-8`
    // with "RP ID cannot be validated", which express.static would otherwise send.
    const assetLinksPath = path.join(webDir, '.well-known', 'assetlinks.json')
    if (existsSync(assetLinksPath)) {
      app.get('/.well-known/assetlinks.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'public, max-age=300')
        response.send(readFileSync(assetLinksPath))
      })
    }
    // `dotfiles: 'allow'` so /.well-known/assetlinks.json (passkey app linking)
    // is served instead of falling through to the SPA handler.
    app.use(express.static(webDir, { index: false, dotfiles: 'allow' }))
    // SPA fallback. Express 5 (path-to-regexp v8) rejects the bare '*' string
    // route, so match with a RegExp and skip API/WS paths.
    app.get(/.*/, (request, response, next) => {
      if (request.path.startsWith('/api') || request.path === '/ws')
        return next()
      // A missing file is a 404, not the app shell, so a broken deploy fails visibly.
      if (looksLikeFilePath(request.path)) {
        sendMissingFile(response)
        return
      }

      response.sendFile(path.join(webDir, 'index.html'))
    })
  }

  // Centralized JSON error handler.
  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof HttpError) {
        response
          .status(error.statusCode)
          .json(localizedError(error.message, requestLocale(request)))
        return
      }
      // Never the message: it can repeat the data the error was raised with.
      logger.error('unhandled error', describeError(error))
      response
        .status(500)
        .json(localizedError('Internal server error.', requestLocale(request)))
    },
  )

  return app
}
