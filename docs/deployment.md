# Deployment

How the production service at `persistent.dynamic-solutions.ca` is run, configured and looked after. Development is in [development](development.md); the parts of the system are in [ARCHITECTURE.md](../ARCHITECTURE.md).

## The server

Production is one Docker image, built from `Dockerfile`, serving the API and the built web app on one origin, plus PostgreSQL; both are defined in `compose.server.yml`. The server holds a git checkout and a filled-in `.env` behind the shared nginx reverse proxy, whose site file for this product is the tracked `nginx.server.conf`. TLS is terminated upstream.

Deploy from a clean, pushed tree with the `deploy` skill, or directly:

```bash
npm run deploy:prod            # dump, update, build, wait for health, install the nginx site
npm run deploy:prod -- --dry-run
```

The deploy script is devkit's generated `scripts/deploy/deploy-over-ssh.mjs`; its settings are the `deploy` block in `devkit.config.mjs`, and what it does is in [devkit's README](https://github.com/Dynamic-Solutions-Canada/devkit#deploying). It refuses unless the tree is clean and `HEAD` is a freshly fetched `origin/main`, runs `npm run validate`, then on the server: refuses a checkout with tracked changes; dumps and verifies the database into `.backups/` in the checkout, keeping the newest ten; fast-forwards `main` and the submodules (the web build imports the promo catalog, so publish a promo commit before pushing a Persistent commit that references it); runs `docker compose up --build --wait` and stops with the logs if a service is not healthy; installs `nginx.server.conf` as `conf.d/persistent.conf` if it changed, keeping the old file and rolling back if `nginx -t` fails; and prunes dangling images.

The target comes from your local `.env`: `DEPLOY_SSH_HOST`, `DEPLOY_REPO_PATH`, and `DEPLOY_SSH_PORT` when your ssh config does not set it.

The `Image Check` workflow builds the production image on every change that affects it and fails if it runs as root, so a broken build shows up before a deploy.

Each deploy labels the image with the commit and release it was built from (`org.opencontainers.image.revision` and `.version`): the deploy script exports `DEPLOY_REVISION` and `DEPLOY_VERSION` (the root `package.json` version, which the `release` skill keeps equal to the web app's), and `compose.server.yml` passes them to the build. `docker inspect persistent-api` shows what is running.

The nginx site file is the tracked `nginx.server.conf`, which the deploy installs as `conf.d/persistent.conf` in the shared nginx container. It matched the live file on 2026-11-18, before the first deploy that installs it.

## How production config reaches the container

The server's `.env` is **not** copied into the image; `.dockerignore` excludes it at any depth. `lib/env.ts` does `import 'dotenv/config'`, so a baked-in copy would both embed secrets (the database password, the Cloudflare token) in a distributable layer and hide the container's real configuration from `docker inspect`.

Instead, compose uses the host `.env` for substitution, and `compose.server.yml` lists what the api service actually receives. **Adding a variable to the schema is not enough:** a key read by `apps/api/src/lib/env.ts` but missing from that `environment:` block is silently `undefined` in production, which looks like a disabled feature. `apps/api/src/lib/env.test.ts` enforces that every schema key is declared in `compose.server.yml` or as a `Dockerfile` `ENV`.

So to add config: the schema in `env.ts`, then `environment:` in `compose.server.yml`, then the value in the server's `.env`, then redeploy.

The API container runs as the image's unprivileged `node` user (uid 1000), so a file mounted into it, such as the FCM service-account key under `.secrets/`, must be readable by uid 1000 on the host. An unreadable key does not stop the API: it stays healthy and logs `fcm auth failed` on every push. Compose marks the container healthy once `GET /api/health` answers.

## Backup, export and deletion

### Backup

All service data is in PostgreSQL, in the `persistent-data` Docker volume on the server. The maintainer is responsible for backups, which work in two layers (CTR-12 in the shared standards):

- **Whole-server backup:** the server is backed up whole at the hypervisor (Proxmox) level, which covers this product's volumes along with everything else on the host. This is in place today.
- **Pre-deploy dumps:** every deploy dumps and verifies the database before the checkout or containers change, and keeps the newest ten in the server checkout's `.backups/` (folder mode 700, each dump 600). They start with the first deploy on devkit's generated script.

#### Restoring a dump

A dump is a gzipped plain `pg_dump` of the `persistent` database, verified when it is taken by `gzip -t` and by its closing "PostgreSQL database dump complete" line. To restore one, load it into an empty database of the same PostgreSQL major version (16), then point the API at it:

```bash
gzip -dc <dump>.sql.gz | docker compose -f compose.server.yml exec -T db psql -U "$POSTGRES_USER" -d <empty database> -v ON_ERROR_STOP=1
```

Restore into a fresh database rather than over the live one, check it (`npx prisma migrate status` against it should report the schema up to date), and only then switch to it.

**Tried on 2026-11-18** (CTR-12) on disposable `postgres:16-bookworm` containers: a database migrated to all 28 migrations and filled with `npm run db:seed` synthetic data was dumped exactly as the deploy will dump it, verified, and restored into a second empty database. Row counts matched, Prisma reported the schema up to date, and a dump of the restored database was identical to the original apart from its timestamps.

A backup holds the same personal data and secrets as the live database and needs the same protection.

### Export

**Not yet in place:** there is no self-service export of a user's reminders and history. Users can read everything they own in the app, but cannot download it. A "download my data" option, a JSON file of the user's own records, is planned, since store-listed products provide one (D-025).

### Account deletion

A user deletes their account from **Settings > Account** in any app, or from the public page at `https://persistent.dynamic-solutions.ca/delete-account`, which store listings link to. Deletion asks the user to type their email address, is immediate, and cannot be undone: there is no soft-delete or restore window.

Deleting the account removes, in one transaction, the user and everything that cascades from it: sessions, passkeys, reminders, occurrences, push registrations, shares the user created or received, and their sign-in codes. What remains afterwards:

- **Assignments the user received:** the creator keeps the progress record; an active assignment becomes declined, and the recipient's address is replaced by "(deleted account)".
- **Reminders shared with the user by others:** they stay with their owners; only the user's access is removed.
- **Operational logs:** the account's internal id stays in the API container's log ("account deleted") until it rotates out; container logs are capped at five 10 MB files. No email address or reminder content is logged.
- **Backups:** a deleted account remains in server backups, and in pre-deploy dumps once they exist, taken before the deletion, until those expire.
