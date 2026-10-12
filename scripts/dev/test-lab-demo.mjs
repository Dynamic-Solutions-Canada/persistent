/** Own a fresh synthetic Compose stack and a temporary HTTPS tunnel, including expiry cleanup. */
import { execFileSync, spawn } from 'node:child_process'
import { assertPublicDemoHealth } from './test-lab-transport.mjs'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { assertUnusedIpv4Subnet } from './isolated-network.mjs'
import { assertOwnedDemoIdentity, removeOwnedDemo } from './test-lab-cleanup.mjs'
import { copyDemoSource, createDemoCompose } from './test-lab-demo-config.mjs'

// Devkit 0.13's background runner is reused without preflight, which would inherit primary .env/data.
const { isBackgroundChild, launchBackgroundRunner, reportBackgroundReady } = await import(
  new URL('./background-runner.mjs', import.meta.resolve('@ryanewen/devkit'))
)
const backgroundChild = isBackgroundChild()

const root = process.cwd()
const stateFile = resolve('tmp/test-lab/demo-session.json')
const command = process.argv[2]
if (command === 'stop') {
  if (!existsSync(stateFile)) {
    console.log('No owned demo session remains. No resources changed.')
    process.exit(0)
  }
  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  assertOwnedDemoIdentity(state.project, state.composePath)
  writeFileSync(stateFile, JSON.stringify({ ...state, stopRequested: true }, null, 2), { mode: 0o600 })
  // Teardown targets the recorded owned Compose identity, never a potentially reused host PID.
  await removeOwnedDemo(state.project, state.composePath)
  removeMatchingState(state.project)
  console.log('Owned demo stack and tunnel cleanup completed.')
} else if (command === 'start') {
  if (process.argv.includes('--background') && !backgroundChild) {
    const launched = await launchBackgroundRunner({ configDir: resolve('tmp/test-lab') }, { slug: 'demo-supervisor' })
    console.log(`Owned detached demo supervisor ready (PID ${launched.pid}); log: ${launched.logPath}`)
  } else {
    await start()
  }
} else {
  throw new Error('Use start or stop. No resources were changed.')
}

/** Remove only this session's metadata; concurrent successful teardown may already have removed it. */
function removeMatchingState(project) {
  try {
    const recorded = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (recorded.project === project) rmSync(stateFile, { force: true })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

/** Build with existing dependencies, prove isolation, then expose only the static demo application. */
async function start() {
  if (existsSync(stateFile)) {
    const previous = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (/^persistent-test-lab-[a-f0-9]{10}$/.test(previous.project)) {
      const containers = execFileSync('docker', ['ps', '--filter', `label=com.docker.compose.project=${previous.project}`, '-q'], { encoding: 'utf8' }).trim()
      if (containers) throw new Error('An owned demo session is still running; stop it before starting another.')
    }
  }
  const suffix = randomBytes(5).toString('hex')
  const project = `persistent-test-lab-${suffix}`
  const directory = resolve(`tmp/${project}`)
  const source = join(directory, 'source')
  const composePath = join(directory, 'compose.json')
  const subnet = process.argv.find((arg) => arg.startsWith('--subnet='))?.slice(9)
  if (!subnet) throw new Error('Select --subnet=<unused small private CIDR> after checking host and VPN routes.')
  const networkIds = execFileSync('docker', ['network', 'ls', '-q'], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean)
  const networks = JSON.parse(execFileSync('docker', ['network', 'inspect', ...networkIds], { encoding: 'utf8' }))
  const routes = JSON.parse(execFileSync('ip', ['-j', '-4', 'route'], { encoding: 'utf8' }))
  const dockerSubnets = networks.flatMap((network) => (network.IPAM.Config ?? []).map((config) => config.Subnet))
  assertUnusedIpv4Subnet(subnet, [...dockerSubnets, ...routes.map((route) => route.dst)])
  const ttlSeconds = 5400
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  mkdirSync(source, { recursive: true })
  mkdirSync(dirname(stateFile), { recursive: true })
  copyDemoSource(source)
  const image = execFileSync('docker', ['inspect', 'persistent-node-1', '--format={{.Image}}'], { encoding: 'utf8' }).trim()
  const config = createDemoCompose(root, source, image, subnet, ttlSeconds)
  writeFileSync(composePath, JSON.stringify(config, null, 2), { mode: 0o600 })
  // Record teardown identity before creating resources, including partially failed startup.
  writeFileSync(stateFile, JSON.stringify({ project, pid: process.pid, url: null, expiresAt: expiresAt.toISOString(), composePath }, null, 2), { mode: 0o600 })
  const compose = ['compose', '--project-name', project, '--file', composePath]
  let closed = false
  let phase = 'create-resources'
  let cleanupTask
  const cleanup = async () => {
    if (cleanupTask) return cleanupTask
    cleanupTask = performCleanup()
    const removed = await cleanupTask
    cleanupTask = undefined
    return removed
  }
  // Signal handlers and server-exit callbacks share one in-process teardown.
  const performCleanup = async () => {
    if (closed) return true
    try {
      await removeOwnedDemo(project, composePath)
    } catch {
      console.error('Owned demo cleanup failed. Session metadata retained for an explicit stop retry.')
      return false
    }
    closed = true
    removeMatchingState(project)
    console.log('Owned demo server, tunnel and fresh database removed.')
    return true
  }
  const finish = async (reason) => {
    console.log(`Owned demo cleanup requested: ${reason}.`)
    process.exit(await cleanup() ? 0 : 1)
  }
  process.once('SIGTERM', () => finish('SIGTERM'))
  process.once('SIGINT', () => finish('SIGINT'))
  process.once('SIGHUP', () => finish('SIGHUP'))
  const expiry = setTimeout(() => finish('90-minute expiry'), ttlSeconds * 1000)
  try {
    execFileSync('docker', [...compose, 'up', '-d', '--wait', 'database', 'node'], { stdio: 'inherit', timeout: 120_000 })
    // A stuck build must not indefinitely block the supervisor's expiry timer.
    const run = (args) => {
      const remaining = expiresAt.getTime() - Date.now()
      if (remaining <= 0) throw new Error('Owned demo setup expired.')
      return execFileSync('docker', [...compose, 'exec', '-T', 'node', ...args], {
        stdio: 'pipe', encoding: 'utf8', timeout: Math.min(120_000, remaining)
      })
    }
    phase = 'prepare-database-and-build'
    console.log('Preparing a fresh database and static demo build.')
    run(['npm', 'run', 'db:migrate:deploy'])
    run(['npm', 'run', 'build', '--workspace', '@persistent/shared'])
    run(['npm', 'run', 'build', '--workspace', '@persistent/api'])
    // The runner loader avoids writing config bundles into the read-only dependency mount.
    run(['npm', 'run', 'build', '--workspace', '@persistent/web', '--', '--configLoader', 'runner'])
    run(['node', '--import', 'tsx', 'scripts/dev/store-assets.ts', 'prepare', '--email=ryan.ewen+persistentdemo@gmail.com'])
    phase = 'verify-synthetic-fixture'
    run(['node', 'scripts/dev/test-lab-fixture.mjs'])
    run(['node', 'scripts/dev/test-lab-onboard.mjs'])
    const emails = JSON.parse(run(['node', '--input-type=module', '-e', "import {PrismaClient} from '@prisma/client';const p=new PrismaClient();console.log(JSON.stringify((await p.user.findMany({select:{email:true},orderBy:{email:'asc'}})).map(u=>u.email)));await p.$disconnect()"] ))
    if (JSON.stringify(emails) !== JSON.stringify(['alex@example.test', 'ryan.ewen+persistentdemo@gmail.com'])) throw new Error('Fresh database isolation check failed.')
    console.log(`Verified synthetic accounts only: ${emails.join(', ')}`)
    const nodeContainer = execFileSync('docker', [...compose, 'ps', '-q', 'node'], { encoding: 'utf8' }).trim()
    const log = join(directory, 'server.log')
    const { appendFileSync } = await import('node:fs')
    // Register completion immediately. A later once('exit') can miss an early
    // crash and report readiness for an already-dead server.
    const launchServer = (origin) => {
      const child = spawn('docker', ['exec', '--env', `CLIENT_ORIGIN=${origin}`, nodeContainer, 'node', 'scripts/dev/test-lab-demo-server.mjs'], { stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', (chunk) => appendFileSync(log, chunk))
      child.stderr.on('data', (chunk) => appendFileSync(log, chunk))
      const exited = new Promise((ready) => {
        child.once('exit', (code, signal) => ready({ code, signal }))
        child.once('error', () => ready({ code: null, signal: 'spawn-error' }))
      })
      return { child, exited }
    }
    phase = 'start-local-demo'
    let server = launchServer('http://localhost:4000')
    let healthy = false
    for (let attempt = 0; attempt < 30; attempt++) {
      try { run(['node', '-e', "fetch('http://localhost:4000/api/health').then(r=>{if(!r.ok)process.exit(1)})"]); healthy = true; break } catch { await new Promise((ready) => setTimeout(ready, 1000)) }
    }
    if (!healthy) throw new Error('Isolated demo server did not become healthy.')
    run(['node', '--input-type=module', '-e', "const r=await fetch('http://localhost:4000/api/auth/request-code',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'blocked@example.test'})});if(r.status!==403)throw Error('Account allowlist failed');console.log('Non-fixture sign-in blocked.')"])
    phase = 'start-public-tunnel'
    execFileSync('docker', [...compose, '--profile', 'expose', 'up', '-d', 'tunnel'], { stdio: 'inherit' })
    const runTunnelLogs = () => execFileSync('docker', [...compose, 'logs', '--no-color', 'tunnel'], { encoding: 'utf8' })
    let url
    for (let attempt = 0; attempt < 60; attempt++) {
      const logs = execFileSync('docker', [...compose, 'logs', '--no-color', 'tunnel'], { encoding: 'utf8' })
      url = logs.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]
      if (url) break
      await new Promise((ready) => setTimeout(ready, 1000))
    }
    if (!url) throw new Error('No temporary HTTPS tunnel URL was issued.')
    writeFileSync(join(directory, 'tunnel-startup.log'), runTunnelLogs(), { mode: 0o600 })
    // Preserve owned routing metadata even when public health fails before readiness.
    writeFileSync(stateFile, JSON.stringify({ project, pid: process.pid, url, expiresAt: expiresAt.toISOString(), composePath, nodeContainer }, null, 2), { mode: 0o600 })
    // Restart only the guarded demo server with its actual HTTPS origin for passkeys, CORS and WS.
    const oldServerExited = server.exited
    run(['node', '-e', "const fs=require('fs');process.kill(Number(fs.readFileSync('/workspace/demo-server.pid','utf8')),'SIGTERM')"])
    await oldServerExited
    server = launchServer(url)
    phase = 'verify-public-health'
    let publicHealthy = false
    let publicHealthFailure = 'no-response'
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        assertPublicDemoHealth(nodeContainer, url)
        publicHealthy = true
        break
      } catch (error) {
        // Retain only safe transport categories, never body/auth data or arbitrary exception text.
        publicHealthFailure = error.message
      }
      await new Promise((ready) => setTimeout(ready, 1000))
    }
    if (!publicHealthy) {
      writeFileSync(join(directory, 'tunnel-startup.log'), runTunnelLogs(), { mode: 0o600 })
      throw new Error(`Temporary public JSON health did not become ready (${publicHealthFailure}).`)
    }
    phase = 'verify-public-auth-and-onboarding'
    run(['node', 'scripts/dev/test-lab-onboard.mjs', `--origin=${url}`])
    if (!server.child.pid || server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error('Owned server exited before readiness.')
    }
    const state = { project, pid: process.pid, url, expiresAt: expiresAt.toISOString(), composePath, nodeContainer }
    writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 })
    console.log(`Temporary synthetic demo: ${url}`)
    console.log(`Expires: ${expiresAt.toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short', hour12: true })} (America/Toronto)`)
    console.log('Stop early: node scripts/dev/test-lab-demo.mjs stop')
    phase = 'supervise-ready-server'
    if (backgroundChild) reportBackgroundReady()
    const { code, signal } = await server.exited
    if (!existsSync(stateFile)) {
      await finish('owned server exited after teardown')
      return
    }
    const recorded = JSON.parse(readFileSync(stateFile, 'utf8'))
    if (recorded.project === project && recorded.stopRequested) {
      await finish('explicit stop')
      return
    }
    throw Object.assign(new Error('Temporary demo server exited.'), { status: code, signal })
  } catch (error) {
    // Child-process errors can contain command output. Report bounded categories,
    // not auth responses, database URLs, or arbitrary stderr.
    console.error(`Temporary demo setup failed phase=${phase} category=${error.name ?? 'Error'} exit=${Number.isInteger(error.status) ? error.status : 'unknown'} signal=${error.signal ?? 'none'}`)
    clearTimeout(expiry)
    await cleanup()
    process.exitCode = 1
  }
}
