# Development environment gotchas

Read when: setting up a fresh checkout, changing the Prisma schema or `packages/shared`, running Prisma migration tools, or bumping devkit.
Governs: `apps/api/prisma/**`, `packages/shared/**`, `package.json`, `scripts/dev/**`

The full workflow is in `docs/development.md`; this guide keeps the traps that have cost time before.

- **Initialise the promo submodule first.** In a fresh checkout, run `git submodule update --init --recursive` before validating or building: the web app and the desktop app both import the catalog in `apps/desktop/external/promo`.
- **Never point `prisma migrate diff --shadow-database-url` at `DATABASE_URL`.** Prisma resets the shadow database, which wipes the dev data. `prisma migrate status` answers "is the schema in step?" without touching anything.
- **A schema change needs `npm run db:generate` and updated shared contracts** in `packages/shared`.
- **Tests import `@persistent/shared` from its built `dist/`.** `validate` builds it first, but a lone `npm test` or `test:integration` needs `npm run build --workspace @persistent/shared` after a shared change.
- **devkit generates the dev runner and the edit guard.** Run `npm exec devkit-init` after a bump. App steps go in `dev:container` and `dev:postprepare`, never in the generated runner.
- **PowerShell scripts stay ASCII-only.** Windows PowerShell 5.1 reads a `.ps1` without a BOM as ANSI, so a single non-ASCII character can break it (also in `apps/desktop/AGENTS.md`).
