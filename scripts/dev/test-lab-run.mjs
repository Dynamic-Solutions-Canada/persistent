/** Submit one disposable capture device only when the Firebase project cannot incur billing. */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertPublicDemoHealth } from './test-lab-transport.mjs'

/** A disabled billing account is the enforceable boundary, not an estimated daily quota. */
export function assertFreeProject(billingEnabled) {
  if (!['false', 'False'].includes(billingEnabled.trim())) {
    throw new Error('Free-only capture requires verified disabled project billing. No job was submitted. Daily free allowance on a billed project is not a spending cap.')
  }
}

/** Preserve the approved virtual-device policy using the live catalog, never a stale name alone. */
export function assertVirtualDevice(device, version) {
  // Stdout/stderr command diagnostics use UiAutomation.executeShellCommandRwe (API 34).
  if (Number(version) < 34 || !device || device.form !== 'VIRTUAL' || device.formFactor !== 'PHONE'
    || !device.supportedVersionIds?.includes(version)) {
    throw new Error('Select an available virtual phone and supported API. No job was submitted.')
  }
}

/** Validate the small, trusted recipe before uploading anything to Google. */
export function validateCapturePlan(plan) {
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 100) {
    throw new Error('Expected between one and 100 reviewed capture steps.')
  }
  const names = new Set()
  for (const step of plan.steps) {
    if (!['javascript', 'wait', 'wait-native', 'shell', 'capture', 'expand-notifications'].includes(step.action)) throw new Error('Unknown capture action.')
    if (step.action === 'capture') {
      if (!/^[a-z0-9-]+\.png$/.test(step.name ?? '') || names.has(step.name)) throw new Error('Capture filenames must be unique PNG names.')
      if (!['web', 'shade', 'alarm'].includes(step.surface)) throw new Error('Capture surface must be web, shade or alarm.')
      if (step.surface === 'web') {
        const controls = step.requiredControls
        if (!Array.isArray(controls) || controls.length === 0 || new Set(controls).size !== controls.length
          || controls.some((control) => !['header', 'navigation', 'dialog'].includes(control))) {
          throw new Error('Web captures require explicit, unique visible control checks.')
        }
      } else if (step.surface === 'alarm' && (typeof step.reminderTitle !== 'string'
        || !step.reminderTitle.trim() || step.reminderTitle.length > 200)) {
        throw new Error('Alarm captures require the expected synthetic reminder title.')
      }
      names.add(step.name)
    } else if (step.action !== 'expand-notifications') {
      let source = step.expression
      if (step.action === 'shell') source = step.command
      if (step.action === 'wait-native') source = step.text
      if (typeof source !== 'string' || !source.trim()) throw new Error('Missing capture action source.')
    }
  }
  if (names.size < 1) throw new Error('The recipe has no screenshot.')
  return names.size
}

/** Resolve mounted input files, rejecting paths unavailable inside the isolated CLI container. */
function mountedFile(path) {
  const absolute = resolve(path)
  const mounted = relative(process.cwd(), absolute)
  if (mounted.startsWith('..') || !existsSync(absolute)) throw new Error('Capture input must exist inside this checkout.')
  return `/workspace/${mounted}`
}

/** Check billing immediately before one matrix submission; never retry paid resources automatically. */
async function main() {
  const args = process.argv.slice(2)
  const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  const project = 'persistent-7c99a'
  const diagnostic = args.includes('--probe')
  const model = option('model') ?? 'MediumPhone.arm'
  const version = option('version') ?? '36'
  if (!model || !version || !/^[a-zA-Z0-9_.-]+$/.test(model) || !/^\d+$/.test(version)) {
    throw new Error('Select one currently available device with --model=<id> --version=<api>.')
  }
  const app = mountedFile(option('app') ?? 'tmp/test-lab/app-direct-debug.apk')
  const test = mountedFile(option('test') ?? 'tmp/test-lab/app-direct-debug-androidTest.apk')
  const planPath = option('plan') ?? 'apps/mobile/test-lab/carousel.json'
  const plan = mountedFile(planPath)
  const count = validateCapturePlan(JSON.parse(readFileSync(planPath, 'utf8')))
  const origin = new URL(option('origin') ?? '')
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.hostname === 'persistent.dynamic-solutions.ca' || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Pass a credential-free isolated HTTPS demo origin.')
  }
  if (!args.includes('--run')) {
    console.log(`Capture inputs valid: ${count} screenshot(s), one device, five-minute maximum. Add --run to check billing and submit.`)
    return
  }
  const cloud = resolve('scripts/dev/test-lab-cloud.sh')
  const session = JSON.parse(readFileSync('tmp/test-lab/demo-session.json', 'utf8'))
  if (session.url !== origin.origin || !/^persistent-test-lab-[a-f0-9]{10}$/.test(session.project)
    || new Date(session.expiresAt).getTime() - Date.now() < 10 * 60_000) {
    throw new Error('A matching owned demo session with at least ten minutes remaining is required. No job was submitted.')
  }
  assertPublicDemoHealth(session.nodeContainer, origin.origin)
  const billing = execFileSync(cloud, ['billing', 'projects', 'describe', project, '--format=value(billingEnabled)'], { encoding: 'utf8' })
  assertFreeProject(billing)
  const catalog = JSON.parse(execFileSync(cloud, ['firebase', 'test', 'android', 'models', 'list', `--project=${project}`, '--format=json'], { encoding: 'utf8' }))
  assertVirtualDevice(catalog.find((device) => device.id === model), version)
  execFileSync(cloud, [
    'firebase', 'test', 'android', 'run', `--project=${project}`, '--type=instrumentation',
    `--app=${app}`, `--test=${test}`, ...(diagnostic
      ? ['--test-runner-class=androidx.test.runner.AndroidJUnitRunner', '--test-targets=class ca.persistent.app.capture.NativeCaptureProbe']
      : ['--test-runner-class=ca.persistent.app.capture.StoreCaptureRunner']),
    `--device=model=${model},version=${version},locale=en,orientation=portrait`,
    '--timeout=5m', '--num-flaky-test-attempts=0', '--no-auto-google-login',
    `--other-files=/data/local/tmp/persistent-capture-plan.json=${plan}`,
    `--environment-variables=demoOrigin=${origin.origin},capturePlan=/data/local/tmp/persistent-capture-plan.json`,
    '--directories-to-pull=/sdcard/Android/data/ca.persistent.app/files/Pictures/store-captures',
    `--client-details=matrixLabel=${diagnostic ? 'Persistent-native-diagnostic' : 'Persistent-store-captures'}`
  ], { stdio: 'inherit' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
