/** Verify non-interactive runtime selection without modifying the host's nvm settings. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const source = join(dirname(fileURLToPath(import.meta.url)), 'with-project-node.sh')

/** Build a synthetic checkout with mismatched host and matching nvm executables. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'persistent-runtime-'))
  const scripts = join(root, 'scripts/dev')
  const host = join(root, 'host')
  const pinned = join(root, 'pinned')
  const nvm = join(root, 'nvm')
  for (const dir of [scripts, host, pinned, nvm]) mkdirSync(dir, { recursive: true })
  copyFileSync(source, join(scripts, 'with-project-node.sh'))
  writeFileSync(join(root, '.nvmrc'), '20.20.2\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({ engines: { npm: '10.8.2' } }))
  writeFileSync(join(host, 'node'), '#!/bin/sh\necho v24.18.0\n', { mode: 0o755 })
  writeFileSync(join(pinned, 'node'), '#!/bin/sh\nif [ "$1" = --version ]; then echo v20.20.2; else echo 10.8.2; fi\n', { mode: 0o755 })
  writeFileSync(join(pinned, 'npm'), '#!/bin/sh\necho 10.8.2\n', { mode: 0o755 })
  writeFileSync(join(nvm, 'nvm.sh'), 'nvm() { export PATH="$PINNED_BIN:$PATH"; }\n')

  return {
    root,
    script: join(scripts, 'with-project-node.sh'),
    env: {
      ...process.env,
      PATH: `${host}:${process.env.PATH}`,
      NVM_DIR: nvm,
      PINNED_BIN: pinned,
      npm_config_user_agent: 'npm/11.16.0 node/v24.18.0',
      npm_node_execpath: '/host/node',
      npm_execpath: '/host/npm'
    }
  }
}

test('selects pinned tools and removes stale npm identity before running a hook', () => {
  const f = fixture()
  try {
    const result = spawnSync('bash', [f.script, 'bash', '-c',
      'node --version; npm --version; echo "${npm_config_user_agent-unset}:${npm_node_execpath-unset}:${npm_execpath-unset}"; printf "%s" "$1"',
      'hook', 'argument with spaces'], { env: f.env, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, 'v20.20.2\n10.8.2\nunset:unset:unset\nargument with spaces')
  } finally {
    rmSync(f.root, { recursive: true, force: true })
  }
})

test('fails before running the command when the pinned runtime is unavailable', () => {
  const f = fixture()
  try {
    const result = spawnSync('bash', [f.script, 'echo', 'should not run'], {
      env: { ...f.env, NVM_DIR: join(f.root, 'absent') }, encoding: 'utf8'
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Node 20\.20\.2 is required/)
    assert.equal(result.stdout, '')
  } finally {
    rmSync(f.root, { recursive: true, force: true })
  }
})

test('preserves command failures and rejects an incorrect npm version', () => {
  const f = fixture()
  try {
    const failed = spawnSync('bash', [f.script, 'bash', '-c', 'exit 7'], { env: f.env })
    assert.equal(failed.status, 7)
    writeFileSync(join(f.env.PINNED_BIN, 'npm'), '#!/bin/sh\necho 11.16.0\n')
    const wrongNpm = spawnSync('bash', [f.script, 'echo', 'should not run'], { env: f.env, encoding: 'utf8' })
    assert.equal(wrongNpm.status, 1)
    assert.match(wrongNpm.stderr, /npm 10\.8\.2 is required/)
    assert.equal(wrongNpm.stdout, '')
  } finally {
    rmSync(f.root, { recursive: true, force: true })
  }
})
