/**
 * Upload approved screenshots and notes into the CLI-created Store draft, then optionally
 * commit it. Every listing locale gets its own generated hero first, then the shared
 * screenshots (D-123). `--check` plans and validates every listing with no Store call.
 */
import { readFile, copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { pngSize } from '../../apps/mobile/scripts/play-publish.mjs'
import {
  member,
  mergeStoreListing,
  assertReleasePackage,
} from './windows-store-listing.mjs'
import {
  archiveRoots,
  confirmStoreScreenshots,
  resolveStoreScreenshots,
} from './windows-store-screenshots.mjs'
import { listingTexts } from '../release/notes.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const assetsRoot = path.join(root, 'store-assets')
const productId = '9PCX2XGQ7CJS'
const origin = 'https://manage.devcenter.microsoft.com'

/**
 * Read the manifest, the Microsoft listing text and the approved notes for the version being
 * submitted. Validates the notes' presence; images are validated per plan (validateImages).
 */
async function loadAssets() {
  const manifest = JSON.parse(
    await readFile(path.join(assetsRoot, 'manifest.json'), 'utf8'),
  )
  const listings = JSON.parse(
    await readFile(path.join(assetsRoot, 'microsoft/listings.json'), 'utf8'),
  )
  // The approved notes for the version being submitted, in every listing locale (LIST-10).
  const props = await readFile(
    path.join(root, 'apps/desktop/Directory.Build.props'),
    'utf8',
  )
  const version = /<Version>(\d+\.\d+\.\d+)<\/Version>/.exec(props)?.[1]
  if (!version)
    throw new Error('Could not read <Version> from Directory.Build.props.')
  const notes = listingTexts('desktop', version)
  return { manifest, listings, notes }
}

/**
 * Check every planned image before anything is uploaded: a screenshot path under
 * store-assets/microsoft/screenshots/ (a hero in its locale folder), and a PNG the Store takes.
 */
async function validateImages(plan) {
  const sources = new Set(plan.files.map((image) => image.source))
  for (const source of sources) {
    if (
      !/^microsoft\/screenshots\/(?:[A-Za-z]{2,3}(?:-[A-Za-z0-9]+)*\/)?[a-z0-9-]+\.png$/.test(
        source,
      )
    )
      throw new Error(`Unexpected desktop screenshot path: ${source}`)
    const bytes = await readFile(path.join(assetsRoot, source))
    const size = pngSize(bytes)
    if (
      !size ||
      size.width < 1366 ||
      size.height < 768 ||
      bytes.length > 50 * 1024 * 1024 ||
      bytes.length < 33 ||
      bytes[24] !== 8 ||
      bytes[25] !== 2
    ) {
      throw new Error(`Invalid Store screenshot: ${source}`)
    }
  }
}

/**
 * Plan every listings.json locale and run the merge and read-back check against a synthetic
 * draft, so check mode fails on a missing image, caption or note exactly as a real run would,
 * with no Store call and no credentials.
 */
async function checkAssets() {
  const { manifest, listings, notes } = await loadAssets()
  const locales = Object.keys(listings.locales)
  const plan = resolveStoreScreenshots(manifest, listings, locales)
  await validateImages(plan)

  // A draft as the Store returns it: a logo and last release's screenshot in each listing.
  const draft = {
    listings: Object.fromEntries(
      locales.map((locale) => [
        locale.toLowerCase(),
        {
          baseListing: {
            images: [
              {
                fileName: 'logo.png',
                fileStatus: 'Uploaded',
                imageType: 'Icon',
              },
              {
                fileName: 'old.png',
                fileStatus: 'Uploaded',
                imageType: 'Screenshot',
              },
            ],
          },
        },
      ]),
    ),
  }
  confirmStoreScreenshots(mergeStoreListing(draft, plan, notes), plan)
  for (const [locale, images] of plan.locales)
    console.log(
      `  ${locale}: ${images.map((image) => image.source).join(', ')}`,
    )
  return plan
}

/** Create a short-lived authenticated API client; never print credentials, responses, or SAS URLs. */
async function requester() {
  const tenant = process.env.AZURE_AD_TENANT_ID
  const client = process.env.AZURE_AD_APPLICATION_CLIENT_ID
  const secret = process.env.AZURE_AD_APPLICATION_SECRET
  if (!tenant || !client || !secret)
    throw new Error('Missing Microsoft Store credentials.')
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: client,
        client_secret: secret,
        scope: `${origin}/.default`,
      }),
    },
  )
  if (!response.ok)
    throw new Error(`Store authentication failed (${response.status}).`)
  let token
  try {
    token = await response.json()
  } catch {
    throw new Error('Store authentication returned invalid JSON.')
  }
  if (!token.access_token)
    throw new Error('Store authentication returned no token.')
  return async (route, method = 'GET', body) => {
    const result = await fetch(`${origin}/v1.0${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        TenantId: tenant,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!result.ok)
      throw new Error(`Store ${method} failed (${result.status}).`)
    const text = await result.text()
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      // An API response can contain upload credentials, so keep parser errors out of logs.
      throw new Error('Store API returned invalid JSON.')
    }
  }
}

/**
 * Stage the exact CLI input package and every locale's images in one ZIP under their
 * registered names: a draft takes a single upload, so the images travel with the package.
 */
async function archive(packagePath, files, directory) {
  const contents = path.join(directory, 'contents')
  await mkdir(contents)
  const packageName = path.basename(packagePath)
  await copyFile(packagePath, path.join(contents, packageName))
  for (const image of files) {
    const target = path.join(contents, image.fileName)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(assetsRoot, image.source), target)
  }
  const output = path.join(directory, 'submission.zip')
  const result = spawnSync(
    'tar.exe',
    ['-a', '-cf', output, '-C', contents, ...archiveRoots(packageName, files)],
    { encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error('Could not create Store package and screenshot archive.')
  return output
}

/**
 * Update only the current pending draft, preserving its package identity and all unowned
 * metadata: every listing's screenshots are replaced (its hero first, then the shared set) and
 * its release notes set, then the draft is read back to confirm the display order.
 * @param commit commit the submission for certification after the read-back passes
 */
async function publish(packagePath, commit) {
  if (process.platform !== 'win32')
    throw new Error('Run Store publication on the Windows release runner.')
  const { manifest, listings, notes } = await loadAssets()
  const request = await requester()
  const application = await request(`/my/applications/${productId}`)
  const id = member(member(application, 'pendingApplicationSubmission'), 'id')
  if (!id) throw new Error('The CLI did not create a pending Store submission.')
  const route = `/my/applications/${productId}/submissions/${encodeURIComponent(id)}`
  const draft = await request(route)
  if (member(draft, 'status') !== 'PendingCommit')
    throw new Error('The Store submission is not an editable pending draft.')
  assertReleasePackage(draft, path.basename(packagePath))

  // Plan and validate every listing's images before the first change, so a gap changes nothing.
  const plan = resolveStoreScreenshots(
    manifest,
    listings,
    Object.keys(member(draft, 'listings') ?? {}),
  )
  await validateImages(plan)
  const submission = mergeStoreListing(draft, plan, notes)
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'persistent-store-upload-'),
  )
  try {
    const uploadArchive = await archive(packagePath, plan.files, directory)
    const updated = await request(route, 'PUT', submission)
    const uploadUrl =
      member(updated, 'fileUploadUrl') ?? member(draft, 'fileUploadUrl')
    if (!uploadUrl) throw new Error('The Store draft returned no upload URL.')
    let destination
    try {
      destination = new URL(uploadUrl)
    } catch {
      throw new Error('The Store draft returned an invalid upload URL.')
    }
    if (
      destination.protocol !== 'https:' ||
      !destination.hostname.endsWith('.blob.core.windows.net')
    ) {
      throw new Error('The Store draft returned an unexpected upload host.')
    }
    const size = await stat(uploadArchive)
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(size.size),
        'x-ms-blob-type': 'BlockBlob',
      },
      body: createReadStream(uploadArchive),
      duplex: 'half',
    })
    if (!upload.ok)
      throw new Error(`Store artwork upload failed (${upload.status}).`)

    // Read the draft back: every listing must expect its planned screenshots in display order,
    // and the release package must still be there.
    const verified = await request(route)
    confirmStoreScreenshots(verified, plan)
    assertReleasePackage(verified, path.basename(packagePath))
    const fallback = plan.fallback.length
      ? `; en-US screenshots for ${plan.fallback.join(', ')}`
      : ''
    console.log(
      `Replaced the screenshots in ${plan.locales.size} listings and set their release notes in submission ${id}${fallback}.`,
    )
    if (commit) {
      await request(`${route}/commit`, 'POST', {})
      console.log(`Committed Microsoft Store submission ${id} for processing.`)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const packageIndex = process.argv.indexOf('--package')
try {
  if (process.argv.includes('--check')) {
    const plan = await checkAssets()
    console.log(
      `Microsoft Store assets valid: ${plan.locales.size} listing locales, ${plan.files.length / plan.locales.size} screenshots each, and release notes. No Store call was made.`,
    )
  } else if (packageIndex >= 0 && process.argv[packageIndex + 1]) {
    await publish(
      path.resolve(process.argv[packageIndex + 1]),
      process.argv.includes('--commit'),
    )
  } else {
    throw new Error(
      'Usage: publish-windows-store-assets.mjs --check | --package <msixupload> [--commit]',
    )
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Store publication failed.',
  )
  process.exitCode = 1
}
