/** User-level AppImage installation. It updates only owned application files and leaves profiles intact. */
import { chmod, copyFile, mkdir, mkdtemp, open, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { desktopArgument } from '../src/settings.js'

/** Reject an incompatible image before replacing an existing installation. */
export async function validateImage(source: string, architecture: string): Promise<void> {
  const handle = await open(source, 'r')
  try {
    const header = Buffer.alloc(64)
    const result = await handle.read(header, 0, header.length, 0)
    const expected = architecture === 'x64' ? 62 : architecture === 'arm64' ? 183 : null
    if (result.bytesRead < 64 || header.toString('ascii', 0, 4) !== '\x7fELF' || header[4] !== 2 || header[5] !== 1 || header[6] !== 1 || header.toString('ascii', 8, 10) !== 'AI' || header[10] !== 2 || expected === null || header.readUInt16LE(18) !== expected) {
      throw new Error('Choose a type-2 AppImage built for this Linux machine (x64 or ARM64).')
    }
  } finally { await handle.close() }
}

/** Copy through a private directory on the destination filesystem, verifying before atomic replacement. */
export async function replaceImage(source: string, destination: string, verify?: (copied: string) => Promise<void>): Promise<void> {
  const temporary = await mkdtemp(join(dirname(destination), '.persistent-install-'))
  const copied = join(temporary, 'image')
  try {
    await copyFile(source, copied)
    await chmod(copied, 0o755)
    await verify?.(copied)
    const handle = await open(copied, 'r')
    try { await handle.sync() } finally { await handle.close() }
    await rename(copied, destination)
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

/** Atomically install the image and launcher under XDG data, without changing saved sign-in or autostart. */
export async function installImage(source: string, dataDirectory: string, architecture: string, icon: string): Promise<string> {
  await validateImage(source, architecture)
  const directory = join(dataDirectory, 'persistent-linux')
  const applications = join(dataDirectory, 'applications')
  await mkdir(directory, { recursive: true })
  await mkdir(applications, { recursive: true })
  const destination = join(directory, 'Persistent.AppImage')
  const installedIcon = join(directory, 'icon.png')
  const launcher = join(applications, 'ca.persistent.desktop.desktop')
  const temporaryLauncher = `${launcher}.tmp-${process.pid}`
  try {
    if (resolve(source) !== resolve(destination)) {
      await replaceImage(source, destination, (copied) => validateImage(copied, architecture))
    }
    await copyFile(icon, installedIcon)
    await writeFile(temporaryLauncher, `[Desktop Entry]\nType=Application\nName=Persistent\nComment=Reminders that need your confirmation\nExec=${desktopArgument(destination)}\nIcon=${installedIcon}\nTerminal=false\nCategories=Utility;\nStartupWMClass=persistent\n`, { mode: 0o644 })
    await rename(temporaryLauncher, launcher)
    return destination
  } finally {
    await rm(temporaryLauncher, { force: true })
  }
}
