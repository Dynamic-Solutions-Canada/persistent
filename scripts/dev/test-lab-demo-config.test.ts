import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoCompose } from './test-lab-demo-config.mjs'

test('demo configuration never imports production data, credentials or writable dependencies', () => {
  const config = createDemoCompose('/checkout', '/scratch/source', 'existing-image', '10.254.253.0/28', 5400)
  const node = config.services.node
  assert.equal(node.environment.DEMO_MODE, 'true')
  for (const key of ['CLOUDFLARE_EMAIL_ACCOUNT_ID', 'CLOUDFLARE_EMAIL_API_TOKEN',
    'CLOUDFLARE_EMAIL_FROM_EMAIL', 'FCM_SERVICE_ACCOUNT_FILE', 'FCM_PROJECT_ID',
    'GOOGLE_WEB_CLIENT_ID', 'REVIEW_ACCOUNT_EMAIL', 'REVIEW_ACCOUNT_CODE']) {
    assert.equal(node.environment[key], '')
  }
  assert.equal(Object.hasOwn(node, 'env_file'), false)
  assert.deepEqual(config.services.database.volumes, ['demo-database:/var/lib/postgresql/data'])
  assert.ok(node.volumes.slice(1).every((mount: string) => mount.endsWith(':ro')))
  assert.ok(node.volumes.every((mount: string) => !mount.includes('.secrets') && !mount.includes('.env')))
  assert.deepEqual(Object.keys(config.volumes), ['demo-database'])
})
