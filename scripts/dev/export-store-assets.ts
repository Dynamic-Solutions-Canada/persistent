/**
 * Export the Play composition pages to the curated PNGs, with no agent or desktop browser.
 *
 * `npm run shots:render` writes one page per Play listing locale and screenshot under
 * store-assets/render/<locale>/. This serves the repository on a loopback port, starts a pinned
 * headless Chromium in a disposable, memory-capped Docker container, loads each page at
 * 720 x 1280 CSS pixels and a device scale of 1.5, waits for the captured app image and the
 * headline fit, and saves a 1080 x 1920 RGB PNG to store-assets/play/<locale>/.
 *
 * Fonts: the pages name Arial, Yu Gothic (Japanese) and Microsoft YaHei (Chinese). They are read
 * from the Windows fonts folder, mounted read-only (STORE_FONTS_DIR, default /mnt/c/Windows/Fonts),
 * and the image's own CJK fonts are rejected (store-render-fonts.conf), so every host draws the
 * same faces. The export stops before rendering if a required font file is missing.
 *
 * Usage: npm run shots:export [-- <locale> ...]   (default: every Play listing locale)
 * Exits non-zero, after writing the rest, when a page reports `overflow` (copy runs into the
 * phone) or fails to load; fix the copy and export again.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, resolve, sep } from 'node:path'
import { validateStoreImage } from './store-image.ts'
import { captureLocales } from './store-demo-text.ts'

/** Pinned to the Playwright release current on 2026-11-27; bump deliberately and re-check renders. */
const IMAGE = 'mcr.microsoft.com/playwright:v1.65.1-noble'
/** Hard cap for the browser container, with no swap, so a runaway render cannot exhaust the host. */
const MEMORY = '1536m'
const FONTS_DIR = process.env.STORE_FONTS_DIR ?? '/mnt/c/Windows/Fonts'
/** The faces the composition pages name, by their Windows file names. */
const REQUIRED_FONTS = [
  'arial.ttf',
  'arialbd.ttf',
  'YuGothR.ttc',
  'YuGothB.ttc',
  'msyh.ttc',
  'msyhbd.ttc',
]
const REPO = resolve('.')
const CONTAINER = `persistent-store-export-${process.pid}`
/** How long one page may take to load its capture and fit its headline. */
const PAGE_TIMEOUT_MS = 20_000

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.json': 'application/json',
}

interface PlayShot {
  file: string
  source: string
}

/** Stop with a clear message when a font the pages name is not in the mounted folder. */
function requireFonts(): void {
  const missing = REQUIRED_FONTS.filter(
    (name) => !existsSync(join(FONTS_DIR, name)),
  )
  if (missing.length > 0)
    throw new Error(
      `Missing fonts in ${FONTS_DIR}: ${missing.join(', ')}. Set STORE_FONTS_DIR to a folder with the Windows Arial, Yu Gothic and Microsoft YaHei files.`,
    )
}

/**
 * Serve the repository read-only on a loopback port, so each page's relative image and module
 * paths resolve as they do on disk. Requests outside the repository are refused.
 */
async function serveRepository(): Promise<Server> {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(
      new URL(request.url ?? '/', 'http://x').pathname,
    )
    const file = resolve(REPO, '.' + path)
    if (!file.startsWith(REPO + sep) || !existsSync(file)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    })
    response.end(readFileSync(file))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return server
}

/** A free loopback port for the browser's DevTools endpoint. */
async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const { port } = probe.address() as AddressInfo
  await new Promise((done) => probe.close(done))
  return port
}

/**
 * Start the pinned headless Chromium in a removable container on the host network, with the
 * Windows fonts and the font rules mounted read-only. Returns once DevTools answers.
 */
async function startBrowser(port: number): Promise<void> {
  const chrome = `exec $(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -n 1) --headless=new --no-sandbox --disable-gpu --hide-scrollbars --remote-debugging-address=127.0.0.1 --remote-debugging-port=${port} --user-data-dir=/tmp/profile about:blank`
  spawn(
    'docker',
    [
      'run',
      '--rm',
      '--name',
      CONTAINER,
      '--network',
      'host',
      '--memory',
      MEMORY,
      '--memory-swap',
      MEMORY,
      '-v',
      `${FONTS_DIR}:/usr/share/fonts/windows:ro`,
      '-v',
      `${join(REPO, 'scripts/dev/store-render-fonts.conf')}:/etc/fonts/conf.d/10-store-render.conf:ro`,
      IMAGE,
      'sh',
      '-c',
      chrome,
    ],
    { stdio: 'ignore' },
  )

  // The first run pulls the image, so allow a few minutes before giving up.
  for (let attempt = 0; attempt < 600; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`)
      return
    } catch {
      await new Promise((done) => setTimeout(done, 500))
    }
  }
  throw new Error(
    `Chromium did not start (${IMAGE}); see docker logs ${CONTAINER}.`,
  )
}

/** Remove the browser container; quiet when it has already gone. */
function stopBrowser(): void {
  try {
    execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' })
  } catch {
    // Already removed.
  }
}

/** A minimal DevTools session on one new page target. */
async function openPage(port: number) {
  const target = (await (
    await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
      method: 'PUT',
    })
  ).json()) as { webSocketDebuggerUrl: string }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done)
    socket.addEventListener('error', fail)
  })

  let nextId = 0
  const pending = new Map<
    number,
    (message: { result?: unknown; error?: { message: string } }) => void
  >()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    // Only replies to commands sent here carry a numeric id; events and anything else are ignored.
    if (typeof message.id !== 'number' || !pending.has(message.id)) return
    const resolveReply = pending.get(message.id)!
    pending.delete(message.id)
    resolveReply(message)
  })

  /** Send one DevTools command and return its result, or throw its error. */
  async function send<T>(method: string, params: object = {}): Promise<T> {
    const id = ++nextId
    const message = await new Promise<{
      result?: unknown
      error?: { message: string }
    }>((done) => {
      pending.set(id, done)
      socket.send(JSON.stringify({ id, method, params }))
    })
    if (message.error) throw new Error(`${method}: ${message.error.message}`)
    return message.result as T
  }

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 720,
    height: 1280,
    deviceScaleFactor: 1.5,
    mobile: false,
  })
  return { send, close: () => socket.close() }
}

/**
 * Load one page and wait until its capture has loaded, the fonts are ready and the headline fit
 * has finished. Returns the page's `data-fit` value (`ok` or `overflow`).
 */
async function loadPage(
  page: Awaited<ReturnType<typeof openPage>>,
  url: string,
): Promise<string> {
  await page.send('Page.navigate', { url })
  const deadline = Date.now() + PAGE_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 200))
    const { result } = await page.send<{ result: { value?: string } }>(
      'Runtime.evaluate',
      {
        expression: `(async () => {
        const image = document.querySelector('.screen img')
        await document.fonts.ready
        if (!image || !image.complete || image.naturalWidth === 0) return 'loading'
        return document.documentElement.dataset.fit
      })()`,
        awaitPromise: true,
        returnByValue: true,
      },
    )
    if (result.value === 'ok' || result.value === 'overflow')
      return result.value
  }
  throw new Error(
    `${url} did not finish loading within ${PAGE_TIMEOUT_MS / 1000} s.`,
  )
}

/** Export every requested locale's pages and report the ones that need attention. */
async function main(): Promise<void> {
  requireFonts()
  const manifest = JSON.parse(
    readFileSync('store-assets/manifest.json', 'utf8'),
  ) as {
    play: PlayShot[]
  }
  const requested = process.argv.slice(2)
  const locales =
    requested.length > 0
      ? requested
      : captureLocales('store-assets/play/listings.json')

  const server = await serveRepository()
  const { port: webPort } = server.address() as AddressInfo
  const browserPort = await freePort()
  const problems: string[] = []
  try {
    await startBrowser(browserPort)
    const page = await openPage(browserPort)

    for (const locale of locales) {
      for (const shot of manifest.play) {
        const name = shot.file
          .split('/')
          .at(-1)!
          .replace(/\.png$/, '')
        const html = `store-assets/render/${locale}/${name}.html`
        if (!existsSync(html)) {
          problems.push(`${html} is missing; run npm run shots:render first.`)
          continue
        }

        try {
          const fit = await loadPage(
            page,
            `http://127.0.0.1:${webPort}/${html}`,
          )
          const { data } = await page.send<{ data: string }>(
            'Page.captureScreenshot',
            {
              format: 'png',
            },
          )
          const bytes = Buffer.from(data, 'base64')
          validateStoreImage(bytes, 'play')

          const out = `store-assets/play/${locale}/${name}.png`
          mkdirSync(`store-assets/play/${locale}`, { recursive: true })
          writeFileSync(out, bytes)
          console.log(
            `${out}${fit === 'ok' ? '' : '  OVERFLOW: shorten the copy'}`,
          )
          if (fit !== 'ok')
            problems.push(`${out}: the copy runs into the phone.`)
        } catch (error) {
          problems.push(`${html}: ${(error as Error).message}`)
        }
      }
    }
    page.close()
  } finally {
    stopBrowser()
    server.close()
  }

  if (problems.length > 0) {
    console.error(problems.join('\n'))
    process.exitCode = 1
  }
}

await main()
