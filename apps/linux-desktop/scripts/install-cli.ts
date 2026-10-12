/** Bundled user installer entry; the root install command builds this from the reviewed working tree. */
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { installImage } from './install.js'

async function main(): Promise<void> {
  if (process.platform !== 'linux' || !process.argv[2]) throw new Error('Usage: npm run install:linux -- /path/to/Persistent.AppImage')
  const data = process.env.XDG_DATA_HOME || join(homedir(), '.local/share')
  const icon = resolve(__dirname, '../resources/icon.png')
  const installed = await installImage(resolve(process.argv[2]), data, process.arch, icon)
  console.log(`Installed Persistent for this user: ${installed}`)
  console.log('Quit any running Persistent app and relaunch from your application menu to use the new build.')
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Linux installation failed')
  process.exitCode = 1
})
