/** Debian ownership comes from the system package database, not an optional publisher marker. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)

/** Unpackaged/dev builds are inert; AppImage identity takes precedence over Debian detection. */
export async function installedPackageKind(packaged: boolean, image: string | undefined, executable: string,
  query: (path: string) => Promise<string> = async (path) => (await execute('/usr/bin/dpkg-query', ['--search', path], { timeout: 3000 })).stdout
): Promise<'AppImage' | 'deb' | null> {
  if (!packaged) return null
  if (image) return 'AppImage'
  try {
    const owner = await query(executable)
    return owner.trim() === `persistent: ${executable}` ? 'deb' : null
  } catch {
    // Missing dpkg or an unowned executable is a normal AppImage-only distro/dev case.
    return null
  }
}
