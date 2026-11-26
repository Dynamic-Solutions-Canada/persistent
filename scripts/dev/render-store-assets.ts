/**
 * Generate reusable marketing layouts around captured UI; never synthesize app content.
 *
 * Play: one HTML page per screenshot and Play listing locale, under store-assets/render/<locale>/,
 * each framing that locale's own capture with its headline and caption from
 * store-assets/play/listings.json. The page breaks and sizes the headline with devkit's Store
 * hero rule (`fitText`: balanced lines, and up to 15 percent smaller to keep a lone word with its
 * neighbours), measured in the browser with the font it renders in, so CJK breaks match what is
 * drawn. Render each page in Paseo at 720 x 1280 CSS pixels (store-assets/README.md).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { captureLocales } from './store-demo-text.ts'

interface PlayShot {
  file: string
  source: string
  theme: string
}
interface MicrosoftShot {
  file: string
  alt: string
  hero?: object
}
interface PlayFrameText {
  screenshotHeadlines?: string[]
  screenshotCaptions?: string[]
}

const manifest = JSON.parse(
  readFileSync('store-assets/manifest.json', 'utf8'),
) as { play: PlayShot[]; microsoft: MicrosoftShot[] }
const listings = JSON.parse(
  readFileSync('store-assets/microsoft/listings.json', 'utf8'),
) as { locales: Record<string, { copyFrom?: string }> }
const playListings = JSON.parse(
  readFileSync('store-assets/play/listings.json', 'utf8'),
) as { locales: Record<string, PlayFrameText> }

/**
 * devkit's line breaking, imported by the page itself through Vite's /@fs/ route. The module
 * has no imports and is not in devkit's package exports, so it is loaded by path; it is the
 * same file `devkit-store-hero` uses, so the rule cannot drift.
 */
const DEVKIT_TEXT =
  'node_modules/@dynamic-solutions-canada/devkit/src/store-hero/text.mjs'

/** The headline box: the h1 max-width (as before localization), two lines, from 48 px down to 30 px. */
const HEADLINE = { largest: 48, smallest: 30, maxWidth: 610, maxLines: 2 }

// The generated hero (D-123) has one image per listing locale; the sheet shows each listing
// locale's own row. copyFrom locales reuse their target's.
const heroLocales = Object.entries(listings.locales)
  .filter(([, record]) => !record.copyFrom)
  .map(([locale]) => locale)
const hero = manifest.microsoft.find((shot) => shot.hero)
const playLocales = captureLocales('store-assets/play/listings.json')

/** A manifest path for one listing locale (paths without `{locale}` are shared). */
function forLocale(path: string, locale: string): string {
  return path.replace('{locale}', locale)
}

/** Escape captions and relative asset paths before inserting them into static HTML. */
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  )
}

/**
 * The page for one Play screenshot in one locale. The headline starts as the raw text and the
 * module script replaces it with fitted lines; `data-fit` on <html> ends as `ok`, or
 * `overflow` (with a red outline) when the copy runs into the phone, so a capture can check it.
 */
function playPage(
  shot: PlayShot,
  index: number,
  locale: string,
  headline: string,
  caption: string,
): string {
  const angle = index % 2 === 0 ? -2 : 2
  const fit = JSON.stringify({ ...HEADLINE, locale, text: headline })
  return `<!doctype html>
<html lang="${escape(locale)}" data-fit="pending"><meta charset="utf-8"><title>Persistent store composition</title>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; width: 720px; height: 1280px; overflow: hidden; }
body { background: #e7edf3 url('../../marketing/studio-background.png') center/cover; color: #26384a; font-family: Arial, sans-serif; }
.copy { position: absolute; top: 46px; left: 60px; right: 60px; z-index: 2; }
h1 { white-space: pre-line; margin: 0; font-size: 48px; line-height: 1.06; letter-spacing: -1.5px; max-width: 610px; }
p { margin: 15px 0 0; color: #52677b; font-size: 22px; line-height: 1.35; }
[data-fit="overflow"] .copy { outline: 3px solid #d00; }
.phone { position: absolute; width: 460px; height: 1002px; left: 130px; top: 216px;
  padding: 17px 10px 10px; border-radius: 46px; transform: rotate(${angle}deg);
  background: linear-gradient(110deg,#626974,#10151b 12%,#131920 88%,#75808c);
  border: 2px solid #6e7985; box-shadow: 22px 26px 40px #253b5b45, 4px 6px 8px #182d4b35, inset 0 0 0 3px #a2acb930; }
.phone:before { content: ''; position: absolute; height: 3px; width: 62px; border-radius: 8px; top: 7px; left: 197px; background: #111820; }
.screen { width: 100%; height: 100%; overflow: hidden; border-radius: 30px; background: ${shot.theme === 'enjoy-dark' ? '#191a1d' : '#fafaf9'}; }
img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
<div class="copy"><h1>${escape(headline)}</h1><p>${escape(caption)}</p></div>
<div class="phone"><div class="screen"><img src="../../${escape(forLocale(shot.source, locale))}" alt="Captured Persistent app screen"></div></div>
<script type="module">
import { fitText, sizeSteps } from '../../../${DEVKIT_TEXT}'
const fit = ${fit}
await document.fonts.ready
const h1 = document.querySelector('h1')
const style = getComputedStyle(h1)
const context = document.createElement('canvas').getContext('2d')
// Measure with the font, weight and tracking the headline is drawn in.
const measureAt = (size) => (line) => {
  context.font = style.fontWeight + ' ' + size + 'px ' + style.fontFamily
  context.letterSpacing = style.letterSpacing
  return context.measureText(line).width
}
const fitted = fitText(fit.text, {
  locale: fit.locale,
  sizes: sizeSteps(fit.largest, fit.smallest),
  maxWidth: fit.maxWidth,
  maxLines: fit.maxLines,
  lineHeight: 1.06,
  measureAt,
})
if (fitted) {
  h1.style.fontSize = fitted.size + 'px'
  h1.textContent = fitted.lines.join('\\n')
}
// The copy must end above the phone, which starts at 216 px.
const bottom = document.querySelector('.copy').getBoundingClientRect().bottom
document.documentElement.dataset.fit = fitted && bottom <= 206 ? 'ok' : 'overflow'
</script>
</html>`
}

// Play: one page per locale and screenshot.
for (const locale of playLocales) {
  const record = playListings.locales[locale] ?? {}
  const headlines = record.screenshotHeadlines ?? []
  const captions = record.screenshotCaptions ?? []
  if (
    headlines.length !== manifest.play.length ||
    captions.length !== manifest.play.length
  )
    throw new Error(
      `play/listings.json ${locale}: needs ${manifest.play.length} screenshotHeadlines and screenshotCaptions.`,
    )

  mkdirSync(`store-assets/render/${locale}`, { recursive: true })
  for (const [index, shot] of manifest.play.entries()) {
    const name = shot.file
      .split('/')
      .at(-1)!
      .replace(/\.png$/, '.html')
    writeFileSync(
      `store-assets/render/${locale}/${name}`,
      playPage(shot, index, locale, headlines[index], captions[index]),
    )
  }
  console.log(
    `Render in Paseo at 720x1280 CSS pixels, then save as ${forLocale(manifest.play[0].file, locale).replace(/[^/]+$/, '')}: store-assets/render/${locale}/*.html`,
  )
}

/** One Play row and one Microsoft row of the review sheet, for a locale. */
function reviewRows(locale: string): string {
  return `<h2>${escape(locale)}</h2><div class="play">
${manifest.play.map((shot) => `<figure><img src="../${escape(forLocale(shot.file, locale))}" alt="${escape(locale)} Play screenshot"></figure>`).join('')}
</div><div class="desktop">
${manifest.microsoft.map((shot) => `<figure><img src="../microsoft/${escape(forLocale(shot.file, locale))}" alt="${escape(shot.alt)}"></figure>`).join('')}
</div>`
}

// A review sheet gives the whole refresh a stable, easy-to-share visual overview: each locale's
// Play carousel and Microsoft set, then every listing locale's hero.
const review = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Persistent store refresh</title>
<style>
* { box-sizing: border-box; } body { margin: 0; padding: 28px; width: 1440px; min-height: 730px; background: #eef0f2; color: #26384a; font: 16px Arial, sans-serif; }
h1 { font-size: 26px; margin: 0 0 16px; } h2 { font-size: 20px; margin: 20px 0 12px; }
.play { display: grid; grid-template-columns: repeat(${manifest.play.length},1fr); gap: 14px; }
.desktop { display: grid; grid-template-columns: repeat(${manifest.microsoft.length},1fr); gap: 14px; margin-top: 14px; }
.heroes { display: grid; grid-template-columns: repeat(${heroLocales.length},1fr); gap: 14px; }
figcaption { margin-top: 4px; font-size: 13px; color: #52677b; }
figure { margin: 0; } img { width: 100%; display: block; border-radius: 6px; }
.play img { height: 390px; object-fit: contain; } .desktop img { height: 178px; object-fit: contain; }
</style><h1>Persistent: Google Play carousel and Microsoft Store tray flyout, per listing locale</h1>
${playLocales.map(reviewRows).join('\n')}${
  hero
    ? `<h2>Microsoft Store: generated first screenshot per listing locale</h2><div class="heroes">
${heroLocales.map((locale) => `<figure><img src="../microsoft/${escape(forLocale(hero.file, locale))}" alt="${escape(hero.alt)}"><figcaption>${escape(locale)}</figcaption></figure>`).join('')}
</div>`
    : ''
}</html>`
writeFileSync('store-assets/render/review.html', review)
