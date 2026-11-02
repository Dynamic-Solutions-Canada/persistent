/** A launcher disconnect must not turn diagnostics into an uncaught EPIPE. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHostLog } from './host-log.js'

test('resident logging works with closed launcher output and omits error details', () => {
  const directory = mkdtempSync(join(tmpdir(), 'persistent-log-'))
  try {
    const source = `import { closeSync } from 'node:fs';
      import { createHostLog } from ${JSON.stringify(new URL('./host-log.ts', import.meta.url).href)};
      closeSync(1); closeSync(2);
      createHostLog(${JSON.stringify(directory)})('Sign-in diagnostic', new Error('private response'));`
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source])
    assert.equal(result.status, 0)
    const contents = readFileSync(join(directory, 'host.log'), 'utf8')
    assert.match(contents, /Sign-in diagnostic \(Error\)/)
    assert.doesNotMatch(contents, /private response/)
    writeFileSync(join(directory, 'host.log'), 'x'.repeat(1_000_001))
    createHostLog(directory)('After rotation')
    assert.match(readFileSync(join(directory, 'host.log'), 'utf8'), /After rotation/)
    assert.equal(readFileSync(join(directory, 'host.log.previous'), 'utf8').length, 1_000_001)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('unwritable log destination never throws or writes to a launcher pipe', () => {
  const directory = mkdtempSync(join(tmpdir(), 'persistent-log-'))
  try {
    const file = join(directory, 'file')
    writeFileSync(file, '')
    assert.doesNotThrow(() => createHostLog(file)('Diagnostic'))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
