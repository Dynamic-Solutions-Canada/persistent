/**
 * Dependency-free Play phone-screenshot validation and per-language upload planning.
 *
 * Shared by the legacy English `--listing` mode and the localized `--listing-json --images`
 * mode, so both apply one set of Play rules. Lives apart from play-publish.mjs because
 * play-metadata.mjs needs it too, and play-publish.mjs already imports play-metadata.mjs.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

/** Manifest paths are under store-assets/play/ and named so the order is readable on disk. */
const MANIFEST_FILE = /^play\/[a-z0-9-]+\.(png|jpe?g)$/

export class PlayImages {
  /** Play's slot name for phone screenshots; a listing carries several image types. */
  static type = 'phoneScreenshots'

  /**
   * Play's rules for a phone screenshot. Checked locally because the API's rejection
   * arrives mid-edit with a message that does not name the offending file.
   */
  static rules = {
    min: 320,
    max: 3840,
    maxAspect: 2,
    maxBytes: 8 * 1024 * 1024,
    count: [2, 8],
  }

  /**
   * PNG dimensions, straight from the IHDR chunk, or null when the bytes are not a PNG.
   *
   * @param {Buffer} buffer Whole file contents.
   * @returns {{ width: number, height: number } | null}
   */
  static pngSize(buffer) {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE))
      return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  /**
   * Whether a PNG carries an alpha channel. Play wants 24-bit screenshots with none and
   * rejects the upload otherwise. IHDR colour types 4 (grey+alpha) and 6 (RGBA) carry it.
   */
  static pngHasAlpha(buffer) {
    if (!PlayImages.pngSize(buffer)) return false
    const colorType = buffer.readUInt8(25)
    return colorType === 4 || colorType === 6
  }

  /**
   * JPEG dimensions from the first start-of-frame marker, or null when the bytes are not
   * a readable JPEG. Walks the marker segments rather than scanning for bytes, because
   * embedded thumbnails can contain marker-like sequences.
   *
   * @param {Buffer} buffer Whole file contents.
   * @returns {{ width: number, height: number } | null}
   */
  static jpegSize(buffer) {
    if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8)
      return null
    let offset = 2
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) return null
      const marker = buffer[offset + 1]

      // Fill bytes and standalone markers carry no length field.
      if (marker === 0xff) {
        offset += 1
        continue
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2
        continue
      }

      const length = buffer.readUInt16BE(offset + 2)
      // SOF0-SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
      const isFrame =
        marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
      if (isFrame) {
        if (offset + 9 > buffer.length) return null
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        }
      }
      offset += 2 + length
    }
    return null
  }

  /**
   * The upload content type and dimensions of a PNG or JPEG, or null for anything else.
   *
   * @param {Buffer} buffer Whole file contents.
   * @returns {{ contentType: 'image/png' | 'image/jpeg', width: number, height: number } | null}
   */
  static imageInfo(buffer) {
    const png = PlayImages.pngSize(buffer)
    if (png) return { contentType: 'image/png', ...png }
    const jpeg = PlayImages.jpegSize(buffer)
    if (jpeg) return { contentType: 'image/jpeg', ...jpeg }
    return null
  }

  /**
   * Everything wrong with a screenshot set, named per file. Empty means publishable.
   *
   * @param {{ name: string, bytes: Buffer }[]} shots In upload order.
   * @returns {string[]}
   */
  static screenshotProblems(shots) {
    const { min, max, maxAspect, maxBytes, count } = PlayImages.rules
    const problems = []
    if (shots.length < count[0] || shots.length > count[1]) {
      problems.push(
        `Play takes ${count[0]}-${count[1]} phone screenshots; found ${shots.length}.`,
      )
    }
    for (const shot of shots) {
      const info = PlayImages.imageInfo(shot.bytes)
      if (!info) {
        problems.push(`${shot.name}: not a PNG or JPEG.`)
        continue
      }
      if (PlayImages.pngHasAlpha(shot.bytes)) {
        problems.push(
          `${shot.name}: has an alpha channel; Play wants 24-bit PNG with none.`,
        )
      }

      const shortSide = Math.min(info.width, info.height)
      const longSide = Math.max(info.width, info.height)
      if (shortSide < min || longSide > max) {
        problems.push(
          `${shot.name}: ${info.width}x${info.height}, each side must be ${min}-${max}px.`,
        )
      } else if (longSide / shortSide > maxAspect) {
        problems.push(
          `${shot.name}: ${info.width}x${info.height}, the long side may be at most ${maxAspect}x the short side.`,
        )
      }

      if (shot.bytes.length > maxBytes) {
        problems.push(
          `${shot.name}: ${(shot.bytes.length / 1e6).toFixed(1)} MB exceeds Play's 8 MB cap.`,
        )
      }
    }
    return problems
  }

  /**
   * The phone screenshots the manifest approves for Play, in carousel order.
   *
   * Only `play` entries are read. The icon and feature graphic have no manifest entry,
   * so the image sync never touches them.
   *
   * @param {{ play?: { file?: unknown }[] }} manifest Parsed store-assets/manifest.json.
   * @returns {string[]} Paths relative to the manifest's directory.
   */
  static manifestScreenshots(manifest) {
    if (!Array.isArray(manifest?.play) || !manifest.play.length) {
      throw new Error('The manifest has no `play` screenshots.')
    }
    const files = manifest.play.map((entry) => entry?.file)
    for (const file of files) {
      if (typeof file !== 'string' || !MANIFEST_FILE.test(file)) {
        throw new Error(`Unexpected Play screenshot path: ${String(file)}.`)
      }
    }
    if (new Set(files).size !== files.length) {
      throw new Error('The manifest lists a Play screenshot twice.')
    }
    return files
  }

  /**
   * Read and validate the manifest's Play screenshots. Each file is read once, and the
   * same bytes go to every language. Throws, naming every problem, before any network
   * call, so a bad image never opens an edit.
   *
   * @param {string} manifestPath Path to store-assets/manifest.json.
   * @returns {{ name: string, bytes: Buffer, contentType: string, width: number, height: number }[]}
   */
  static loadScreenshots(manifestPath) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const root = dirname(manifestPath)
    const shots = PlayImages.manifestScreenshots(manifest).map((name) => ({
      name,
      bytes: readFileSync(resolve(root, name)),
    }))
    const problems = PlayImages.screenshotProblems(shots)
    if (problems.length) {
      throw new Error(
        `${manifestPath} screenshots are not publishable:\n  - ${problems.join('\n  - ')}`,
      )
    }
    return shots.map((shot) => ({
      ...shot,
      ...PlayImages.imageInfo(shot.bytes),
    }))
  }

  /**
   * One phone-screenshot replacement per language: the same files, in the same order.
   * Languages come from the text sync, so the plan never reaches a Play listing the
   * text sync does not own.
   *
   * @template Shot
   * @param {string[]} languages Play language tags, in sync order.
   * @param {Shot[]} shots Validated screenshots, in carousel order.
   * @returns {{ language: string, imageType: string, shots: Shot[] }[]}
   */
  static plan(languages, shots) {
    if (!shots.length) throw new Error('An image plan needs screenshots.')
    return languages.map((language) => ({
      language,
      imageType: PlayImages.type,
      shots,
    }))
  }
}
