/** Publish deterministic, schema-validated checksums only after all Linux CPU/package builds exist. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { linuxUpdateManifestSchema, linuxVersionSchema, type LinuxUpdateArtifact } from '@persistent/shared'

/** Build metadata from the exact package files destined for this Linux release. */
export async function releaseManifest(directory: string, version: string): Promise<void> {
  linuxVersionSchema.parse(version)
  const artifacts: LinuxUpdateArtifact[] = []
  for (const architecture of ['x64', 'arm64'] as const) {
    for (const kind of ['AppImage', 'deb'] as const) {
      const cpu = architecture === 'arm64' ? 'arm64' : kind === 'deb' ? 'amd64' : 'x86_64'
      const name = `Persistent-Linux-${version}-${cpu}.${kind}`
      const file = join(directory, name)
      const hash = createHash('sha512')
      for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
      artifacts.push({ architecture, kind, name, size: (await stat(file)).size, sha512: hash.digest('base64') })
    }
  }
  const manifest = linuxUpdateManifestSchema.parse({ format: 1, version, artifacts })
  await writeFile(join(directory, `Persistent-Linux-${version}-update.json`), JSON.stringify(manifest, null, 2) + '\n')
}

if (process.argv[2] && process.argv[3]) {
  void releaseManifest(resolve(process.argv[2]), process.argv[3]).catch((error: unknown) => { console.error(error); process.exitCode = 1 })
}
