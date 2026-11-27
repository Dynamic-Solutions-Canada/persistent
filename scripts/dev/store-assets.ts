/** Repeatable store demo preparation and asset checks. */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import { createPrismaClient } from '../../apps/api/src/lib/prisma-client.js'
import { validateStoreImage } from './store-image.ts'
import {
  captureLocales,
  DEFAULT_DEMO_LOCALE,
  demoText,
} from './store-demo-text.ts'

const DEMO_EMAIL = 'demo@example.test'
const RECIPIENT_EMAIL = 'alex@example.test'
const RECIPIENT_NAME = 'Persistent screenshot recipient'

/**
 * Seed only the known development demo account, and expose synthetic scenario ids. With
 * `--locale=<listing locale>` the sample text is that listing's (store-assets/demo-text.json);
 * the capture loops run this once per locale, before capturing it.
 */
async function prepare(): Promise<void> {
  const email = process.argv.find((arg) => arg.startsWith('--email='))?.slice(8)
  const locale =
    process.argv.find((arg) => arg.startsWith('--locale='))?.slice(9) ??
    DEFAULT_DEMO_LOCALE
  // Fails before any write when the locale has no sample text.
  const text = demoText(locale)
  if (email !== DEMO_EMAIL)
    throw new Error(
      `Pass --email=${DEMO_EMAIL}. Personal accounts are not capture fixtures.`,
    )
  const host = new URL(process.env.DATABASE_URL ?? '').hostname
  if (
    !['database', 'localhost', '127.0.0.1', 'persistent-database-1'].includes(
      host,
    )
  ) {
    throw new Error(
      'Store preparation requires the isolated development database.',
    )
  }
  const prisma = createPrismaClient(process.env.DATABASE_URL ?? '')
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, displayName: 'Store demo', timeZone: 'America/Toronto' },
      update: {},
    })
    const existingRecipient = await prisma.user.findUnique({
      where: { email: RECIPIENT_EMAIL },
    })
    if (existingRecipient && existingRecipient.displayName !== RECIPIENT_NAME) {
      throw new Error(
        'The sample recipient already exists outside this fixture. Refusing to replace their data.',
      )
    }
    // This existing seed owns all dates, doses, and checked-item examples.
    execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        'scripts/dev/seed-demo-listing.ts',
        `--email=${email}`,
        `--locale=${locale}`,
      ],
      { stdio: 'inherit' },
    )
    await prisma.$transaction(async (tx) => {
      const recipient = await tx.user.upsert({
        where: { email: RECIPIENT_EMAIL },
        create: {
          email: RECIPIENT_EMAIL,
          displayName: RECIPIENT_NAME,
          timeZone: 'America/Toronto',
        },
        update: {},
      })
      await tx.reminderAssignment.deleteMany({
        where: { creatorId: user.id, recipientId: recipient.id },
      })
      await tx.reminder.deleteMany({ where: { userId: recipient.id } })
      const finishedAt = new Date(Date.now() - 60 * 60_000)
      const reminder = await tx.reminder.create({
        data: {
          userId: recipient.id,
          title: text.parcel.title,
          schedule: { kind: 'none', timesOfDay: [] },
          startDate: finishedAt.toLocaleDateString('en-CA', {
            timeZone: 'America/Toronto',
          }),
        },
      })
      await tx.reminderOccurrence.create({
        data: {
          userId: recipient.id,
          reminderId: reminder.id,
          status: 'ACKNOWLEDGED',
          scheduledFor: new Date(finishedAt.getTime() - 15 * 60_000),
          firedAt: new Date(finishedAt.getTime() - 15 * 60_000),
          acknowledgedAt: finishedAt,
        },
      })
      await tx.reminderAssignment.create({
        data: {
          creatorId: user.id,
          recipientId: recipient.id,
          recipientEmail: RECIPIENT_EMAIL,
          reminderId: reminder.id,
          title: reminder.title,
          state: 'ACTIVE',
          acceptedAt: new Date(finishedAt.getTime() - 30 * 60_000),
          lastCompletedAt: finishedAt,
        },
      })
    })
    const reminders = await prisma.reminder.findMany({
      where: { userId: user.id },
      select: { id: true, title: true },
    })
    mkdirSync('store-assets', { recursive: true })
    writeFileSync(
      'store-assets/fixture.json',
      JSON.stringify(
        {
          capturedAgainst: 'development',
          email,
          locale,
          preparedAt: new Date().toISOString(),
          timeZone: 'America/Toronto',
          reminders,
        },
        null,
        2,
      ) + '\n',
    )
    console.log(
      `Prepared synthetic ${locale} store fixture. Scenario ids: store-assets/fixture.json`,
    )
  } finally {
    await prisma.$disconnect()
  }
}

/**
 * Check the curated files against the stores' pixel and encoding requirements. A Play entry
 * with `{locale}` needs one file per Play listing locale with its own record (no fallback to
 * en-US, which would put English screens in a translated listing), and every locale needs one
 * frame headline and caption per screenshot.
 */
function check(): void {
  const manifest = JSON.parse(
    readFileSync('store-assets/manifest.json', 'utf8'),
  ) as {
    play: Array<{ file: string }>
    microsoft: Array<{ file: string }>
  }
  const selectedStore = process.argv
    .find((arg) => arg.startsWith('--store='))
    ?.slice(8)
  if (selectedStore && !['play', 'microsoft'].includes(selectedStore))
    throw new Error('Expected --store=play or --store=microsoft.')
  for (const [store, shots] of Object.entries(manifest)) {
    if (store !== 'play' && store !== 'microsoft') continue
    if (selectedStore && selectedStore !== store) continue
    // winui-app-kit's renderer checks the Microsoft images and the en-US captions
    // (`npm run check:screenshots`); this keeps only the per-locale caption count.
    if (store === 'microsoft') {
      checkCaptions(shots.length)
      continue
    }
    if (shots.length < 4)
      throw new Error(`${store}: expected at least four curated screenshots`)
    if (shots.length > 8)
      throw new Error('play: the carousel supports at most eight screenshots')

    const locales = captureLocales('store-assets/play/listings.json')
    checkFrameText(locales, shots.length)
    const missing: string[] = []
    for (const locale of locales) {
      for (const shot of shots) {
        const file = shot.file.replace('{locale}', locale)
        if (!existsSync(resolve('store-assets', file))) {
          missing.push(file)
          continue
        }
        const { width, height } = validateStoreImage(
          readFileSync(resolve('store-assets', file)),
          store,
        )
        console.log(`${store}: ${file} (${width}x${height})`)
      }
    }
    checkSingleCopy(store, shots, locales)
    if (missing.length) {
      // Group by locale, so the message names what to capture rather than 48 paths.
      const byLocale = new Map<string, number>()
      for (const file of missing) {
        const locale = file.split('/')[1]
        byLocale.set(locale, (byLocale.get(locale) ?? 0) + 1)
      }
      const summary = [...byLocale]
        .map(([locale, count]) => `${locale} (${count} of ${shots.length})`)
        .join(', ')
      throw new Error(
        `play: these listing locales have no capture yet, and there is no fallback to en-US: ${summary}. Capture them (store-assets/README.md).`,
      )
    }
  }
}

/**
 * Every PNG in the Play folder and its locale folders is one the manifest names: one
 * committed copy (LIST-6), and nothing left over for a locale the listing dropped.
 */
function checkSingleCopy(
  store: string,
  shots: Array<{ file: string }>,
  locales: string[],
): void {
  const named = new Set(
    shots.flatMap((shot) =>
      locales.map((locale) => shot.file.replace('{locale}', locale)),
    ),
  )
  const root = resolve('store-assets', store)
  const folders = [
    '',
    ...readdirSync(root, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && /^[a-z]{2}-[A-Z]{2}$/.test(entry.name),
      )
      .map((entry) => entry.name),
  ]
  const stray = folders
    .flatMap((folder) =>
      readdirSync(resolve(root, folder))
        .filter((name) => name.endsWith('.png'))
        .map((name) => [store, folder, name].filter(Boolean).join('/')),
    )
    .filter((file) => !named.has(file))
  if (stray.length)
    throw new Error(
      `${store}: not in the manifest, so not in the listing: ${stray.join(', ')}`,
    )
}

/** Each Play listing locale has one frame headline and caption per screenshot. */
function checkFrameText(locales: string[], count: number): void {
  const listings = JSON.parse(
    readFileSync('store-assets/play/listings.json', 'utf8'),
  ) as {
    locales: Record<
      string,
      { screenshotHeadlines?: string[]; screenshotCaptions?: string[] }
    >
  }
  for (const locale of locales) {
    const record = listings.locales[locale]
    for (const field of [
      'screenshotHeadlines',
      'screenshotCaptions',
    ] as const) {
      const values = record?.[field] ?? []
      if (values.length !== count || values.some((value) => !value.trim()))
        throw new Error(
          `play/listings.json ${locale}: ${values.length} ${field} for ${count} screenshots`,
        )
      if (values.some((value) => value.includes('\u2014')))
        throw new Error(`play/listings.json ${locale}: em dash in ${field}`)
    }
  }
}

/** Each Microsoft listing locale has one caption per screenshot, in manifest order (LIST-8). */
function checkCaptions(count: number): void {
  const listings = JSON.parse(
    readFileSync('store-assets/microsoft/listings.json', 'utf8'),
  ) as {
    locales: Record<
      string,
      { copyFrom?: string; screenshotCaptions?: string[] }
    >
  }
  for (const [locale, record] of Object.entries(listings.locales)) {
    if (record.copyFrom) continue
    const captions = record.screenshotCaptions ?? []
    if (captions.length !== count)
      throw new Error(
        `microsoft/listings.json ${locale}: ${captions.length} screenshot captions for ${count} screenshots`,
      )
  }
}

const command = process.argv[2]
if (command === 'help')
  console.log(
    'Capture workflow: store-assets/README.md. Use shots:prepare, the device captures, shots:render, shots:export (headless Chromium in Docker), then shots:check.',
  )
else if (command === 'prepare') await prepare()
else if (command === 'check') check()
else
  throw new Error(
    'Usage: store-assets.ts prepare --email=... [--locale=...] | check',
  )
