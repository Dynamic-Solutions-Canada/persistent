/** The ordinary Python-only launcher must make its narrow desktop snapshot self-contained. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex')

test('standard desktop launcher stages fresh canonical catalogs inside source_directory without npm or broader repo inputs', (context) => {
  const fixture = mkdtempSync(join(tmpdir(), 'persistent-desktop-staging-'))
  context.after(() => rmSync(fixture, { recursive: true, force: true }))
  const excluded = new Set(['.git', 'bin', 'obj', 'build-inputs', 'layout', 'artifacts'])
  cpSync(join(root, 'apps/desktop'), join(fixture, 'apps/desktop'), { recursive: true, filter: path => !excluded.has(basename(path)) })
  mkdirSync(join(fixture, 'packages/shared/src/messages'), { recursive: true })
  for (const file of readdirSync(join(root, 'packages/shared/src/messages')).filter(file => file.endsWith('.json'))) {
    cpSync(join(root, 'packages/shared/src/messages', file), join(fixture, 'packages/shared/src/messages', file))
  }
  mkdirSync(join(fixture, 'scripts/dev'), { recursive: true })
  cpSync(join(root, 'scripts/windows-build'), join(fixture, 'scripts/windows-build'))
  cpSync(join(root, 'scripts/dev/prepare-desktop-localization.py'), join(fixture, 'scripts/dev/prepare-desktop-localization.py'))
  cpSync(join(root, 'windows-build.json'), join(fixture, 'windows-build.json'))
  mkdirSync(join(fixture, '.secrets'))
  writeFileSync(join(fixture, '.secrets/synthetic-only'), 'must never enter the desktop snapshot')
  const tools = join(fixture, 'tools')
  mkdirSync(tools)
  // This boundary fixture uses the common helper's documented source_directory shape.
  // Real Windows acceptance separately compiles/packages that same narrow snapshot.
  writeFileSync(join(tools, 'windows-build.py'), `import json, shutil, sys
from pathlib import Path
repo=Path(sys.argv[sys.argv.index('--repo')+1])
config=json.loads((repo/'windows-build.json').read_text())
assert config['source_directory']=='apps/desktop'
stage=repo/'snapshot'
shutil.rmtree(stage,ignore_errors=True)
shutil.copytree(repo/config['source_directory'],stage/config['source_directory'])
assert not (stage/'packages').exists()
assert not (stage/'.secrets').exists()
for name in ('Persistent.Desktop','Persistent.Widget'):
    project=(stage/'apps/desktop'/name/(name+'.csproj')).read_text()
    assert '$(LocalizationCatalogDirectory)' in project
props=(stage/'apps/desktop/Directory.Build.props').read_text()
assert 'build-inputs\\\\localization' in props
assert '$(LocalizationCatalogDirectory)' in (stage/'apps/desktop/Persistent.Desktop/Persistent.Desktop.csproj').read_text()
`)
  const run = () => spawnSync('bash', [join(fixture, 'scripts/windows-build'), '--build-only', '--configuration', 'Debug'], {
    encoding: 'utf8', env: { ...process.env, WINDOWS_BUILD_TOOLS: tools }
  })
  const first = run()
  assert.equal(first.status, 0, first.stdout + first.stderr)
  const generated = join(fixture, 'apps/desktop/build-inputs/localization')
  const staged = join(fixture, 'snapshot/apps/desktop/build-inputs/localization')
  const sources = join(fixture, 'packages/shared/src/messages')
  const files = readdirSync(sources).filter(file => file.endsWith('.json'))
  assert.equal(files.length, 7)
  for (const file of files) assert.equal(sha256(readFileSync(join(staged, file))), sha256(readFileSync(join(sources, file))), file)
  assert.equal(existsSync(join(fixture, 'snapshot/packages')), false)
  assert.equal(existsSync(join(fixture, 'snapshot/.secrets')), false)

  const english = join(sources, 'en-US.json')
  const before = sha256(readFileSync(join(generated, 'en-US.json')))
  const updated = JSON.parse(readFileSync(english, 'utf8')) as Record<string, string>
  updated.WindowsShellDescription = 'Changed source must replace the previous prepared catalog.'
  writeFileSync(english, JSON.stringify(updated))
  writeFileSync(join(generated, 'obsolete.json'), '{}')
  const second = run()
  assert.equal(second.status, 0, second.stdout + second.stderr)
  assert.notEqual(sha256(readFileSync(join(staged, 'en-US.json'))), before)
  assert.equal(sha256(readFileSync(join(staged, 'en-US.json'))), sha256(readFileSync(english)))
  assert.equal(existsSync(join(staged, 'obsolete.json')), false)
})
