/** Bundle shared contracts with the host; only native runtime dependencies remain external. */
import { build } from 'esbuild'
import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises'
await rm('dist', { recursive: true, force: true })
await mkdir('dist', { recursive: true })
for (const entry of ['main', 'preload', 'external-preload', 'local-preload', 'shell-preload', 'install', 'release-manifest']) {
  await build({
    entryPoints: [entry === 'install' ? 'scripts/install-cli.ts' : entry === 'release-manifest' ? 'scripts/release-manifest.ts' : `src/${entry}.ts`], outfile: `dist/${entry}.cjs`,
    bundle: true, platform: 'node', target: 'node22', format: 'cjs',
    external: ['electron', '@particle/dbus-next', 'ws', 'x11']
  })
}
await copyFile('../mobile/store/graphics/play-icon.png', 'resources/icon.png')
// electron-builder moves an extraResource out of ASAR. Keep a separate UI copy
// so local settings images and window icons still resolve inside the package.
await copyFile('../mobile/store/graphics/play-icon.png', 'resources/app-icon.png')
await cp('../desktop/external/promo/Assets/PromotedApps', 'resources/promo', { recursive: true })
// A bundled fallback tone, independent of Android content URIs and the hosted page.
// Three short pulses followed by silence repeat without a renderer timer.
const rate = 22050
const samples = rate * 2
const wave = Buffer.alloc(44 + samples * 2)
wave.write('RIFF', 0)
wave.writeUInt32LE(wave.length - 8, 4)
wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20)
wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(rate, 24)
wave.writeUInt32LE(rate * 2, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(samples * 2, 40)
for (let index = 0; index < samples; index++) {
  const seconds = index / rate
  const phase = seconds % 0.4
  const envelope = seconds < 1.2 && phase < 0.25 ? Math.sin(Math.PI * phase / 0.25) : 0
  wave.writeInt16LE(Math.round(Math.sin(seconds * Math.PI * 2 * 880) * envelope * 9000), 44 + index * 2)
}
await writeFile('resources/alarm.wav', wave)
