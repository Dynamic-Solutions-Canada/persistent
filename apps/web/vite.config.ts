import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { webBuildIdPlugin } from './webBuildIdPlugin.ts'
import { navigationCaching } from './serviceWorkerConfig.ts'
import { devkitViteServer } from '@dynamic-solutions-canada/devkit/vite'

// App version, surfaced to the client (the native update check compares it to the
// latest GitHub release).
const appVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
).version as string
// Cache-busting version for the PWA icon URLs (ASSET-7). Bump it, and the
// matching `?v=` on apple-touch-icon in index.html, whenever the icon art changes.
const ICON_VERSION = 2

/** The VITE_-prefixed process environment in loadEnv's shape, so exported values can win. */
function pickViteEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) => key.startsWith('VITE_') && value !== undefined,
    ),
  ) as Record<string, string>
}

// Dev proxies /api and /ws to the API server so the browser talks to one origin.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(
    mode,
    fileURLToPath(new URL('../..', import.meta.url)),
    'VITE_',
  )
  // loadEnv reads files only. Devkit and one-off shell overrides arrive through process.env.
  const env = { ...fileEnv, ...pickViteEnv(process.env) }
  const apiPort = env.VITE_API_PORT ?? '4000'

  return {
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    plugins: [
      react(),
      webBuildIdPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        workbox: {
          navigateFallback: undefined,
          directoryIndex: null,
          globIgnores: ['**/build-id.json'],
          runtimeCaching: [
            navigationCaching,
            {
              // Newly added catalog icons also survive offline visits. Bundled icons
              // use Vite asset imports and are already part of the precache.
              urlPattern:
                /^https:\/\/raw\.githubusercontent\.com\/Dynamic-Solutions-Canada\/apps-promo\/main\/Assets\/PromotedApps\/[\w-]+\.png$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'promoted-app-icons',
                cacheableResponse: { statuses: [200] },
                expiration: {
                  maxEntries: 40,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
              },
            },
          ],
        },
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Persistent',
          short_name: 'Persistent',
          description: "Reminders that won't let you forget.",
          theme_color: '#0b0f19',
          background_color: '#0b0f19',
          display: 'standalone',
          start_url: '/',
          // ASSET-7: `any` and `maskable` are separate files and entries, since a
          // maskable icon needs its art inside the safe zone and the rounded tile
          // would be cropped. devkit-icons generates them from assets/brand/
          // (`npm run icons`); bump ICON_VERSION with the art so installed copies refresh.
          icons: [
            {
              src: 'icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: `icon-192.png?v=${ICON_VERSION}`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `icon-512.png?v=${ICON_VERSION}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `maskable-icon-192.png?v=${ICON_VERSION}`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: `maskable-icon-512.png?v=${ICON_VERSION}`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    server: {
      // Port, bind address, allowed hostnames and the .worktrees/ watch exclusion come from devkit.
      ...devkitViteServer(env),
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
        '/ws': { target: `ws://localhost:${apiPort}`, ws: true },
      },
    },
  }
})
