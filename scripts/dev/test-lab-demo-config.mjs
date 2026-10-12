/** Build a fresh synthetic source tree and explicit Compose configuration without inherited credentials. */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Copy tracked source and reviewed additions, leaving personal configuration and generated outputs behind. */
export function copyDemoSource(source) {
  const files = execFileSync('git', ['ls-files', '--recurse-submodules', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
  const roots = ['apps/api/', 'apps/web/', 'packages/', 'scripts/dev/', 'apps/mobile/scripts/', 'apps/desktop/external/promo/']
  const top = new Set(['package.json', 'package-lock.json', 'tsconfig.base.json'])
  for (const path of files) {
    if (!top.has(path) && !roots.some((prefix) => path.startsWith(prefix))) continue
    if (!existsSync(path)) continue
    mkdirSync(dirname(join(source, path)), { recursive: true })
    cpSync(path, join(source, path))
  }
  for (const file of ['test-lab-demo-server', 'test-lab-onboard', 'test-lab-fixture', 'test-lab-accounts', 'test-lab-transport', 'test-lab-demo-policy']) {
    const path = `scripts/dev/${file}.mjs`
    cpSync(path, join(source, path))
  }
  // Copy only reviewed helpers, including working-tree additions awaiting a commit.
  cpSync('apps/web/src/lib/safeArea.ts', join(source, 'apps/web/src/lib/safeArea.ts'))
  writeFileSync(join(source, '.env'), '# Fresh synthetic capture stack. No inherited credentials.\n', { mode: 0o600 })
}

/** Generate the owned stack using only a blank database, readonly dependencies and explicit demo env. */
export function createDemoCompose(root, source, image, subnet, ttlSeconds) {
  const password = randomBytes(24).toString('hex')
  return {
    services: {
      database: {
        image: 'postgres:16.13-bookworm',
        environment: { POSTGRES_USER: 'capture', POSTGRES_PASSWORD: password, POSTGRES_DB: 'capture' },
        volumes: ['demo-database:/var/lib/postgresql/data'],
        healthcheck: { test: ['CMD-SHELL', 'pg_isready -U capture -d capture'], interval: '2s', timeout: '2s', retries: 30 }
      },
      node: {
        image, user: `${process.getuid()}:${process.getgid()}`, init: true, working_dir: '/workspace',
        // Newly issued Quick Tunnel names can be blocked by the host's upstream resolver.
        // This resolver applies only to the disposable node; Docker still resolves its private services.
        dns: ['1.1.1.1', '1.0.0.1'],
        environment: {
          NODE_ENV: 'development', DEMO_MODE: 'true',
          DATABASE_URL: `postgresql://capture:${password}@database:5432/capture`,
          API_PORT: '4000', CLIENT_ORIGIN: 'http://localhost:4000', WEB_DIST_DIR: '/workspace/apps/web/dist',
          TEST_LAB_DEMO_TTL_SECONDS: String(ttlSeconds),
          // Override image defaults too, not just the host's missing .env.
          CLOUDFLARE_EMAIL_ACCOUNT_ID: '', CLOUDFLARE_EMAIL_API_TOKEN: '',
          CLOUDFLARE_EMAIL_FROM_EMAIL: '', FCM_SERVICE_ACCOUNT_FILE: '', FCM_PROJECT_ID: '',
          GOOGLE_WEB_CLIENT_ID: '', REVIEW_ACCOUNT_EMAIL: '', REVIEW_ACCOUNT_CODE: ''
        },
        volumes: [
          `${source}:/workspace`, `${join(root, 'node_modules')}:/workspace/node_modules:ro`,
          `${join(root, 'apps/web/node_modules')}:/workspace/apps/web/node_modules:ro`
        ],
        depends_on: { database: { condition: 'service_healthy' } },
        command: ['sleep', 'infinity']
      },
      tunnel: {
        image: 'cloudflare/cloudflared:2026.10.0',
        command: ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://node:4000'],
        profiles: ['expose']
      }
    },
    volumes: { 'demo-database': {} },
    networks: { default: { ipam: { config: [{ subnet }] } } }
  }
}
