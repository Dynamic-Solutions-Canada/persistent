import assert from 'node:assert/strict'
import test from 'node:test'
import { assertUnusedIpv4Subnet } from './isolated-network.mjs'

test('isolated networks reject enclosing, contained and exact subnet collisions', () => {
  for (const occupied of ['10.0.0.0/8', '10.254.253.0/28', '10.254.253.4/32']) {
    assert.throws(() => assertUnusedIpv4Subnet('10.254.253.0/28', [occupied]), /overlaps/)
  }
  assert.doesNotThrow(() => assertUnusedIpv4Subnet('10.254.253.0/28', ['default', '0.0.0.0/0', '10.254.252.0/24', '172.22.80.0/20']))
})
