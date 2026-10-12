/** Installation must reject wrong-CPU downloads before changing any existing user files. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installImage } from './install.js'

test('user installation writes a quoted launcher, retains profile data, and refuses an incompatible replacement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'persistent-linux-install-'))
  try {
    const header = Buffer.alloc(64)
    header.write('\x7fELF', 0, 'ascii'); header[4] = 2; header[5] = 1; header[6] = 1
    header.write('AI', 8); header[10] = 2; header.writeUInt16LE(62, 18)
    const source = join(directory, 'download.AppImage')
    const icon = join(directory, 'icon.png')
    const data = join(directory, 'data with spaces')
    await writeFile(source, header)
    await writeFile(icon, 'synthetic icon')
    await mkdir(join(data, 'persistent-linux'), { recursive: true })
    const personal = join(data, 'persistent-linux', 'saved-profile')
    await writeFile(personal, 'retained')
    const installed = await installImage(source, data, 'x64', icon)
    assert.equal(await readFile(personal, 'utf8'), 'retained')
    assert.match(await readFile(join(data, 'applications', 'ca.persistent.desktop.desktop'), 'utf8'), /Exec=".*data with spaces.*"/)
    await assert.rejects(installImage(source, data, 'arm64', icon), /built for this Linux machine/)
    assert.deepEqual(await readFile(installed), header)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
