import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { removeOwnedDemo } from './test-lab-cleanup.mjs'

const project = 'persistent-test-lab-0123456789'
const path = resolve(`tmp/${project}/compose.json`)
const noWait = async () => {}

test('owned cleanup refuses a foreign identity before changing resources', async () => {
  const forbiddenRun = () => { throw new Error('Docker must not run') }
  await assert.rejects(removeOwnedDemo('persistent', path, forbiddenRun, noWait), /Invalid owned/)
  await assert.rejects(removeOwnedDemo(project, resolve('compose.server.yml'), forbiddenRun, noWait), /Invalid owned/)
})

test('Compose exit zero does not establish cleanup when a volume is still in use', async () => {
  let checks = 0
  await assert.rejects(removeOwnedDemo(project, path, (_command: string, args: string[]) => {
    if (args[0] === 'compose') return ''
    assert.ok(args.includes(`label=com.docker.compose.project=${project}`))
    checks++
    return args[0] === 'volume' ? 'owned-volume' : ''
  }, noWait), /resources remain/)
  assert.equal(checks, 18)
})

test('cleanup verifies containers, networks and volumes after pending removal settles', async () => {
  let volumeChecks = 0
  const kinds = new Set<string>()
  await removeOwnedDemo(project, path, (_command: string, args: string[]) => {
    if (args[0] === 'compose') return ''
    kinds.add(args[0])
    if (args[0] === 'volume' && ++volumeChecks === 1) return 'pending-volume'
    return ''
  }, noWait)
  assert.deepEqual([...kinds].sort(), ['network', 'ps', 'volume'])
  assert.equal(volumeChecks, 2)
})
