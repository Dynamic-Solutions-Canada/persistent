/** Approved installation preserves profiles and the running app until replacement succeeds. */
import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { replaceImage, validateImage } from '../scripts/install.js'
import { verifyUpdateFile } from './update-download.js'
import type { LinuxUpdate } from './release-check.js'

/** Only an installed AppImage may be replaced; no privileged package-manager path. */
export async function installUpdate(file: string, update: LinuxUpdate, architecture: string, appImage: string | undefined): Promise<void> {
  await verifyUpdateFile(file, update)
  if (update.artifact.architecture !== architecture) throw new Error('The update CPU does not match this computer.')
  if (!appImage || !isAbsolute(appImage) || !(await lstat(appImage)).isFile()) throw new Error('Install and run the AppImage before using in-app installation.')
  await validateImage(file, architecture)
  await replaceImage(file, appImage, async (copied) => { await verifyUpdateFile(copied, update); await validateImage(copied, architecture) })
}
