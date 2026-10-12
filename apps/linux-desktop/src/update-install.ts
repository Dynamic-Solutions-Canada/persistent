/** Approved installation preserves profiles and the running app until replacement succeeds. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { replaceImage, validateImage } from '../scripts/install.js'
import { verifyUpdateFile } from './update-download.js'
import type { LinuxUpdate } from './release-check.js'

const execute = promisify(execFile)

/** Check Debian identity before any privileged installer is invoked. */
export function assertDebianIdentity(output: string, version: string, architecture: string): void {
  const expected = architecture === 'arm64' ? 'arm64' : architecture === 'x64' ? 'amd64' : null
  const [name, installedVersion, cpu] = output.trim().split('\n')
  if (!expected || name !== 'persistent' || installedVersion !== version || cpu !== expected) {
    throw new Error('The Debian update package identity does not match this app.')
  }
}

/** AppImage replacement is atomic; Debian uses a visible administrator prompt and refuses removals. */
export async function installUpdate(file: string, update: LinuxUpdate, architecture: string, appImage: string | undefined): Promise<void> {
  await verifyUpdateFile(file, update)
  if (update.artifact.architecture !== architecture) throw new Error('The update CPU does not match this computer.')
  if (update.artifact.kind === 'AppImage') {
    if (!appImage || !isAbsolute(appImage) || !(await lstat(appImage)).isFile()) throw new Error('Install and run the AppImage before using in-app installation.')
    await validateImage(file, architecture)
    await replaceImage(file, appImage, async (copied) => { await verifyUpdateFile(copied, update); await validateImage(copied, architecture) })
    return
  }
  const identity = await execute('/usr/bin/dpkg-deb', ['--show', '--showformat', '${Package}\n${Version}\n${Architecture}\n', file], { timeout: 15_000 })
  assertDebianIdentity(identity.stdout, update.version, architecture)
  // No shell, no global repair operation, and no permission to remove other packages.
  // The desktop's polkit agent owns authentication; this app never receives a password.
  await execute('/usr/bin/pkexec', ['/usr/bin/apt-get', 'install', '--assume-yes', '--no-remove', file], { timeout: 5 * 60_000, maxBuffer: 1024 * 1024 })
}
