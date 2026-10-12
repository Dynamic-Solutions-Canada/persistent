/** Create an isolated Android screenshot build, without altering the active generated project. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { execFileSync } from 'node:child_process'

const source = resolve('apps/mobile/android')
const destination = resolve(process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ?? '')
const origin = process.argv.find((arg) => arg.startsWith('--origin='))?.slice(9)
const diagnostic = process.argv.includes('--probe')
if (!origin || !process.argv.some((arg) => arg.startsWith('--output='))) {
  throw new Error('Pass --output=/tmp/persistent-test-lab-build and --origin=https://<isolated-demo-host>.')
}
const parsed = new URL(origin)
if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.hostname === 'persistent.dynamic-solutions.ca') {
  throw new Error('Use a credential-free isolated HTTPS demo origin, never production.')
}
if (!destination.startsWith('/tmp/') || existsSync(destination)) {
  throw new Error('Choose a new directory under /tmp; existing builds are never replaced.')
}
if (!existsSync(join(source, 'app/src/main/assets/capacitor.config.json'))) {
  throw new Error('Prepare and sync Android in the development container first.')
}
cpSync(source, destination, {
  recursive: true,
  filter: (path) => !['build', '.gradle', '.gradle-user', 'release.keystore', 'google-services.json'].includes(basename(path))
})
const settingsPath = join(destination, 'capacitor.settings.gradle')
const settings = readFileSync(settingsPath, 'utf8').replace(/new File\('([^']+)'\)/g, (_, relative) => {
  return `new File('${resolve(source, relative)}')`
})
writeFileSync(settingsPath, settings)
const javaDirectory = join(destination, 'app/src/androidTest/java/ca/persistent/app/capture')
mkdirSync(javaDirectory, { recursive: true })
cpSync('apps/mobile/test-lab/StoreCaptureRunner.java', join(javaDirectory, 'StoreCaptureRunner.java'))
cpSync('apps/mobile/test-lab/LabShell.java', join(javaDirectory, 'LabShell.java'))
cpSync('apps/mobile/test-lab/LabCaptureReadiness.java', join(javaDirectory, 'LabCaptureReadiness.java'))
cpSync('apps/mobile/test-lab/LabNativeSurfaceReadiness.java', join(javaDirectory, 'LabNativeSurfaceReadiness.java'))
// Keep instrumentation Java: UI Automator 2.4 has Kotlin 2.1 metadata, beyond this app's Kotlin 1.9 compiler.
cpSync('apps/mobile/android-tests/LabCaptureGeometry.java', join(javaDirectory, 'LabCaptureGeometry.java'))
const geometryTests = join(destination, 'app/src/test/java/ca/persistent/app/capture')
mkdirSync(geometryTests, { recursive: true })
for (const file of ['LabCaptureGeometry.java', 'LabCaptureGeometryTest.kt']) {
  cpSync(join('apps/mobile/android-tests', file), join(geometryTests, file))
}
if (diagnostic) {
  cpSync('apps/mobile/test-lab/NativeCaptureProbe.java', join(javaDirectory, 'NativeCaptureProbe.java'))
}
const buildPath = join(destination, 'app/build.gradle')
const build = readFileSync(buildPath, 'utf8').replace(
  /testInstrumentationRunner\s+"[^"]+"/,
  diagnostic
    ? 'testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"'
    : 'testInstrumentationRunner "ca.persistent.app.capture.StoreCaptureRunner"'
)
// Pin the verified current stable only in disposable lab test builds, never the shipping app.
writeFileSync(buildPath, build + '\ndependencies { androidTestImplementation "androidx.test.uiautomator:uiautomator:2.4.0" }\n')
const configPath = join(destination, 'app/src/main/assets/capacitor.config.json')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
config.server = { ...config.server, url: parsed.origin, cleartext: false }
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
writeFileSync(join(destination, 'app/src/main/assets/test-lab-provenance.json'), JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  preparedAt: new Date().toISOString(),
  fixtureEmail: 'ryan.ewen+persistentdemo@gmail.com'
}, null, 2) + '\n')
// Capacitor dependencies retain their source paths, but must not write shared build outputs.
writeFileSync(join(destination, 'capture-isolation.gradle'), `allprojects {\n    layout.buildDirectory = file('${destination}/isolated-output/' + project.name)\n}\n`)
console.log(`Prepared isolated capture build: ${destination}`)
console.log('Build both APKs with: ./gradlew --init-script capture-isolation.gradle --no-daemon --max-workers=2 assembleDirectDebug assembleDirectDebugAndroidTest')
