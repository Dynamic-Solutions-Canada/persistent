/** Versioned Linux release metadata shared by the publisher and native updater. */
import { z } from 'zod'

export const linuxVersionSchema = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
  .refine((value) => value.split('.').every((part) => Number.isSafeInteger(Number(part))), 'Invalid version')

export const linuxUpdateArtifactSchema = z.object({
  architecture: z.enum(['x64', 'arm64']),
  kind: z.enum(['AppImage', 'deb']),
  name: z.string().max(160),
  size: z.number().int().positive().max(512 * 1024 * 1024),
  sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/)
}).strict()

export const linuxUpdateManifestSchema = z.object({
  format: z.literal(1),
  version: linuxVersionSchema,
  artifacts: z.array(linuxUpdateArtifactSchema).min(1).max(4)
}).strict().superRefine((manifest, context) => {
  const seen = new Set<string>()
  for (const [index, asset] of manifest.artifacts.entries()) {
    const cpu = asset.architecture === 'arm64' ? 'arm64' : asset.kind === 'deb' ? 'amd64' : 'x86_64'
    const expected = `Persistent-Linux-${manifest.version}-${cpu}.${asset.kind}`
    const key = `${asset.architecture}:${asset.kind}`
    if (asset.name !== expected || seen.has(key)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['artifacts', index], message: 'Invalid or duplicate Linux artifact' })
    }
    seen.add(key)
  }
})

export type LinuxUpdateArtifact = z.infer<typeof linuxUpdateArtifactSchema>
export type LinuxUpdateManifest = z.infer<typeof linuxUpdateManifestSchema>
