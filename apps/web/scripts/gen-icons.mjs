/**
 * gen-icons.mjs: rasterize the web app's PWA icon set (ASSET-7) into public/.
 *
 * No new art: both sources are existing hand-authored SVGs.
 * - `any` icons render `public/favicon.svg` (the rounded tile) as-is.
 * - `maskable` icons and the iOS `apple-touch-icon` render the Android adaptive
 *   foreground (`apps/mobile/assets/icon-foreground.svg`) over a full-bleed square
 *   of the app background. That foreground already keeps the bell inside the
 *   adaptive-icon safe zone, which is well inside the 80 percent a PWA mask
 *   needs, and a full-bleed square is opaque, as iOS requires.
 *
 * Run after changing either SVG, and bump ICON_VERSION in vite.config.ts and
 * index.html so installed copies refresh.
 *
 * Rasterizer is rsvg-convert (librsvg), as in apps/mobile/scripts/gen-icons.mjs;
 * it ships in the development image.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(webRoot, 'public')
const tileSource = join(publicDir, 'favicon.svg')
const foregroundSource = join(webRoot, '..', 'mobile', 'assets', 'icon-foreground.svg')

// The manifest's background_color, so a masked icon and the splash screen match.
const BACKGROUND = '#0b0f19'

const OUTPUTS = [
  { source: 'tile', out: 'icon-192.png', px: 192 },
  { source: 'tile', out: 'icon-512.png', px: 512 },
  { source: 'fullBleed', out: 'maskable-icon-192.png', px: 192 },
  { source: 'fullBleed', out: 'maskable-icon-512.png', px: 512 },
  { source: 'fullBleed', out: 'apple-touch-icon.png', px: 180 },
]

/** Exit with a clear message when the rasterizer is not installed. */
function assertRsvg() {
  try {
    execFileSync('rsvg-convert', ['--version'], { stdio: 'ignore' })
  } catch {
    console.error('[gen-icons] rsvg-convert not found. Run this in the development image, or install librsvg2-bin.')
    process.exit(1)
  }
}

/**
 * Build the full-bleed SVG: the adaptive foreground with an opaque background
 * square inserted as its first child, so the art and its safe-zone scaling stay
 * defined in one file.
 */
function fullBleedSvg() {
  const foreground = readFileSync(foregroundSource, 'utf8')
  const openTag = foreground.match(/<svg\b[^>]*>/)
  if (!openTag) throw new Error(`[gen-icons] no <svg> element in ${foregroundSource}`)
  const background = `<rect width="100%" height="100%" fill="${BACKGROUND}"/>`
  return foreground.replace(openTag[0], openTag[0] + background)
}

/**
 * Render one SVG to a square PNG.
 * @param {{ path?: string, text?: string }} svg a file to read, or SVG text piped on stdin
 * @param {number} px output width and height in pixels
 * @param {string} outPath destination PNG
 */
function render(svg, px, outPath) {
  const size = ['-w', String(px), '-h', String(px)]
  if (svg.path) {
    execFileSync('rsvg-convert', [...size, svg.path, '-o', outPath])
  } else {
    execFileSync('rsvg-convert', [...size, '-o', outPath], { input: svg.text })
  }
}

assertRsvg()
for (const source of [tileSource, foregroundSource]) {
  if (!existsSync(source)) {
    console.error(`[gen-icons] missing source ${source}`)
    process.exit(1)
  }
}

const sources = { tile: { path: tileSource }, fullBleed: { text: fullBleedSvg() } }
for (const { source, out, px } of OUTPUTS) {
  render(sources[source], px, join(publicDir, out))
}
console.log(`[gen-icons] wrote ${OUTPUTS.length} icons to ${publicDir}`)
