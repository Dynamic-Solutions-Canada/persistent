/** Remove only an owned capture stack, and prove absence before discarding its teardown identity. */
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

/** Refuse a foreign project or Compose file before running any Docker mutation. */
export function assertOwnedDemoIdentity(project, composePath) {
  if (!/^persistent-test-lab-[a-f0-9]{10}$/.test(project)
    || composePath !== resolve(`tmp/${project}/compose.json`)) {
    throw new Error('Invalid owned demo teardown identity.')
  }
}

/**
 * Compose can exit successfully while a volume is still in use. Require all
 * labelled resources to disappear; on failure the caller must retain metadata.
 * Inject run/wait only for disconnected tests, never to broaden the ownership filter.
 */
export async function removeOwnedDemo(project, composePath, run = execFileSync, wait = (ms) => new Promise((ready) => setTimeout(ready, ms))) {
  assertOwnedDemoIdentity(project, composePath)
  run('docker', ['compose', '--project-name', project, '--file', composePath,
    '--profile', 'expose', 'down', '--volumes', '--remove-orphans'], { stdio: 'ignore', timeout: 60_000 })

  const filter = `label=com.docker.compose.project=${project}`
  for (let attempt = 0; attempt < 6; attempt++) {
    const queries = [
      ['ps', '-a', '--filter', filter, '--format', '{{.ID}}'],
      ['network', 'ls', '--filter', filter, '--format', '{{.ID}}'],
      ['volume', 'ls', '--filter', filter, '--format', '{{.Name}}']
    ]
    const remaining = queries.map((args) => run('docker', args, { encoding: 'utf8', timeout: 5000 }).trim())
    if (remaining.every((resources) => resources === '')) return
    if (attempt < 5) await wait(500)
  }
  throw new Error('Owned demo resources remain. Teardown identity must be retained for retry.')
}
