# Persistent: Agent Instructions

Persistent is a reminder app whose defining feature is persistence: a reminder nags (a notification that won't dismiss, re-fires after dismissal, an optional repeating alarm sound) until the user explicitly confirms completion, with optional escalation of ignored reminders to the user's other devices and an email contact. It is a hosted web service with public sign-ups, plus a native Android client (Google Play and GitHub) where the hard alarm guarantees live, and Windows (Microsoft Store) and Linux (AppImage) tray hosts of the same web UI. devkit provides the development environment.

## Standards

This repo follows the shared standards at https://github.com/Dynamic-Solutions-Canada/app-standards. Read the index for this stack, https://github.com/Dynamic-Solutions-Canada/app-standards/blob/main/stacks/web.md, then the topic file for the area you are changing. `apps/desktop/AGENTS.md` and `apps/mobile/AGENTS.md` name the Windows and Android stack indexes for those hosts. Where this file differs from the standards, this file wins and says why.

## Architecture

- `apps/api` owns auth, reminder CRUD, the scheduling and escalation engine, push delivery, and a per-user WebSocket at `/ws`.
- `apps/web` is the React PWA. It manages reminders and deliberately sends no notifications. Every native host shows it.
- `apps/mobile` is the Capacitor (Android) wrapper of the built web app plus a custom native alarm plugin: the real persistence guarantee. See `docs/alarm-architecture.md`.
- `apps/desktop` is the WinUI 3 (C#) Windows tray app showing the hosted PWA in a WebView2 flyout, with optional session-bound notifications built from the server-computed alarm projection, so it duplicates no reminder rules. See `docs/desktop-architecture.md`.
- `apps/linux-desktop` is the Electron Linux tray host of the same UI and alarm projection, shipped only as an x64 and ARM64 AppImage. See `docs/linux-desktop-architecture.md`.
- `packages/shared` is the single source of truth for request and response shapes; never duplicate them elsewhere.

The overview, subsystem documents and the list of where data lives are in `ARCHITECTURE.md`. Nested `AGENTS.md` files hold area rules; list them with `git ls-files '*AGENTS.md'` and read the ones for the folders you touch.

## Behaviour

- **Persistence is native.** Truly undismissable notifications and repeating alarm sound while the app is closed are native-OS capabilities, not web ones. The model is device-scheduled plus server backup: the server is the source of truth and materialises occurrences, the native client schedules on-device exact alarms so they fire offline, and FCM is the cross-device, escalation and ad-hoc backup. Read `docs/alarm-architecture.md` and `docs/notification-behavior.md` before touching notifications.
- **Reminders and occurrences.** A `Reminder` is the definition a user manages; the scheduler expands it into independent `ReminderOccurrence` rows, one per firing. A live obligation is an occurrence that is `FIRED` and not yet `ACKNOWLEDGED`. The schedule kinds `none` (remind now) and `never` (a note) are both timeless but behave differently. Read `.agents/guides/reminder-model.md` before changing reminder types, checklists, notes, schedule transitions, the occurrence lifecycle or notification content.
- **Data isolation.** There is no multi-tenancy; ownership is per user. Domain queries filter by the authenticated `userId` (`requireUserId(request)`), with these exceptions only:
  - Sharing: recipient reads and permitted actions must prove an explicit `ReminderShare` grant for that recipient and reminder, and firings stay owned by the creator.
  - Assignment: an assigned reminder belongs to the assignee, and its creator reads only the `ReminderAssignment` progress record scoped by `creatorId`.
  - Administrators may read aggregate cross-user counts after a fresh database admin grant check, exposing no account identities or reminder content.
    See `docs/auth-architecture.md` and `apps/api/AGENTS.md`.

## Conventions and gotchas

- TypeScript everywhere with strict mode intact. `verbatimModuleSyntax` is on, so type-only imports use `import type`.
- Non-trivial modules carry a short JSDoc header naming what they own and any non-obvious invariants.
- PowerShell scripts stay ASCII-only: Windows PowerShell 5.1 reads a `.ps1` without a BOM as ANSI, so a single non-ASCII character can break it.
- Initialise `apps/desktop/external/promo` with `git submodule update --init --recursive` in a fresh checkout before validating or building: the web app and the desktop app both import its catalog.
- Never point `prisma migrate diff --shadow-database-url` at `DATABASE_URL`: Prisma resets the shadow database, which wipes the dev data. `prisma migrate status` answers "is the schema in step?" without touching anything.
- A schema change needs `npm run db:generate` and updated shared contracts.
- Tests import `@persistent/shared` from its built `dist/`: `validate` builds it first, but a lone `npm test` or `test:integration` needs `npm run build --workspace @persistent/shared` after a shared change.
- devkit generates the dev runner, `paseo.json` and the edit guard (`npm exec devkit-init` after a bump); app steps go in `dev:container` and `dev:postprepare`.
- Generated files are not edited by hand: a Claude Code hook (`scripts/hooks/README.md`) rejects edits under `apps/mobile/android/` and to files whose header says they are generated.

## Shared helpers (do not duplicate)

- API HTTP errors: throw `HttpError`, `badRequest`, `notFound` and friends from `apps/api/src/lib/http-error.ts`.
- API env: import `env` from `apps/api/src/lib/env.ts`; never read `process.env` in feature code.
- Prisma: import `prisma` from `apps/api/src/lib/prisma.ts`; a script builds its own client with `createPrismaClient` from `apps/api/src/lib/prisma-client.ts`.
- Realtime: `broadcast(userId, event)` from `apps/api/src/lib/realtime.ts`.
- Push: `dispatchToUser(userId, payload)` from `apps/api/src/lib/delivery/`.
- Email: `sendCloudflareEmail` from `apps/api/src/lib/cloudflare-email.ts`.
- Web HTTP: `apiFetch` from `apps/web/src/lib/apiClient.ts`; never bare `fetch` for JSON.
- Web realtime and caches: WebSocket events invalidate TanStack Query keys (`apps/web/src/lib/wsClient.ts`); components never poll.
- Repository owner and name: `SOURCE_REPOSITORY` from `packages/shared/src/repository.ts` (Windows: `UpdateService.cs`).

## Commands

The devkit-managed Compose stack is the complete development environment. Use the exact Node and npm versions in `package.json`.

| Command                                                    | Proves                                                                                     | Does not prove                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `npm run dev`                                              | Shared (watch), API and web run together                                                   | Anything native                            |
| `npm run validate`                                         | Lint, tests, typecheck and Prisma schema validity; needs no database or `DATABASE_URL`     | Native Android, Windows or Linux behaviour |
| `npm run db:migrate`                                       | Creates and applies Prisma migrations                                                      |                                            |
| `npm run db:seed`                                          | Fills a dev account with reminders in every type and state (`-- --keep`, `-- --email=...`) |                                            |
| `npm run build:linux`                                      | The Linux host builds under the pinned Node runtime                                        | Linux desktop runtime behaviour            |
| `npm run test:desktop`, `test:android`, `test:integration` | Toolchain suites (.NET, Android SDK, a `_test` database), each a CI job                    |                                            |
| `npm run verify:desktop`                                   | Full Windows Debug compile, including XAML                                                 | That the app starts                        |
| `npm run install:desktop`                                  | Installs a dev-signed build on Windows: the only check that sees packaging and startup     | Store certification                        |

`npm test` is `devkit-test`: every `*.test.ts(x)` except `*.integration.test.ts` and `external/`. Kotlin and Java changes have their own compile check (`apps/mobile/AGENTS.md`), and the Windows app has its own plus a CI job (`apps/desktop/AGENTS.md`); neither is optional before finishing. Windows builds go through the shared build bridge from WSL: use the `desktop` skill. CI (`ci.yml`) runs `validate` and the three toolchain suites, and every publishing workflow calls it as its gate.

## Release

Only the `release` skill bumps the version (with notes in `release-notes/`) and tags `android-v*` and `linux-v*`; `deploy` tags `v*`; Windows is `desktop-v*`. See `docs/development.md`.

## Guidance map

| Guide, doc, or skill                              | Read or use when                                                        | Governs                                                                                   |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `.agents/guides/reminder-model.md`                | Changing reminder types, schedules, occurrences or notification content | `apps/api`, `apps/web`, `apps/mobile`, `packages/shared`                                  |
| `.agents/guides/ui-conventions.md`                | Changing any screen, dialog or control                                  | `apps/web/src/**`                                                                         |
| `docs/auth-architecture.md`                       | Touching auth, sessions, passkeys or data isolation                     | `apps/api/src/routes/auth.ts`, domain queries                                             |
| `docs/data-event-contract.md`                     | Changing HTTP or WebSocket data flow or offline sync                    | `apps/api`, `apps/web/src/lib`, `apps/web/src/data`                                       |
| `docs/host-bridge-contract.md`                    | Changing a message, method or fallback between the page and a host      | `apps/web/src/native`, `apps/desktop`, `apps/linux-desktop`, `apps/mobile/android-plugin` |
| `docs/alarm-architecture.md`                      | Changing the notification, alarm or escalation mechanism                | `apps/api/src/lib/delivery`, `apps/mobile`                                                |
| `docs/notification-behavior.md`                   | Changing the user-facing done, silence or snooze guarantee              | every surface                                                                             |
| `docs/desktop-architecture.md`                    | Changing the Windows tray app                                           | `apps/desktop/**`                                                                         |
| `docs/linux-desktop-architecture.md`              | Changing the Linux tray host                                            | `apps/linux-desktop/**`                                                                   |
| `docs/localization.md`                            | Changing copy, catalogs or locale handling                              | `packages/shared/src/messages/**`, all UIs                                                |
| `ARCHITECTURE.md`                                 | Orienting, or changing where the product stores data                    | repo-wide                                                                                 |
| `docs/development.md`                             | Running, testing or releasing                                           | repo-wide                                                                                 |
| `docs/deployment.md`                              | Deploying, server config, backup, export or account deletion            | `Dockerfile`, `compose.server.yml`, `nginx.server.conf`                                   |
| `scripts/hooks/README.md`                         | A Claude Code hook blocked an edit                                      | `scripts/hooks/**`, `.claude/settings.json`                                               |
| `commit` skill                                    | Committing here                                                         | repo-wide                                                                                 |
| `deploy`, `release` skills                        | Deploying the server, releasing Android and web                         | `compose.server.yml`, `.github/workflows/release.yml`                                     |
| `desktop` skill                                   | Building, packaging or installing the Windows app                       | `apps/desktop/**`                                                                         |
| `verify` skill                                    | Confirming a change works in the running app                            | all surfaces                                                                              |
| `audit-docs` skill                                | Checking docs and agent files for drift                                 | `docs/**`, `**/AGENTS.md`, `.agents/**`                                                   |
| `test-android-device`, `store-screenshots` skills | Testing on a physical phone; refreshing store images                    | `apps/mobile`, `store-assets/**`                                                          |

Skills live in `.agents/skills/`; Claude Code reads them through the `.claude/skills` symlink.

## Keeping docs current

| What changed                                                     | Update                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A file, command, script or setting that agent files name         | Every `AGENTS.md`, guide and skill naming it, in the same commit                                               |
| Reminder types, schedules or occurrence lifecycle                | `.agents/guides/reminder-model.md`                                                                             |
| A UI convention                                                  | `.agents/guides/ui-conventions.md`                                                                             |
| A message, method, event or fallback between the page and a host | `docs/host-bridge-contract.md`, in the same commit as the code                                                 |
| Auth, data flow, alarms, notification guarantee, a desktop host  | The matching contract in the guidance map                                                                      |
| An environment variable                                          | `.env.dev.example` or `.env.server.example`, `compose.server.yml` (enforced by `apps/api/src/lib/env.test.ts`) |
| A place the product writes data, or what deletion removes        | `ARCHITECTURE.md` (Where data lives), `docs/deployment.md`                                                     |
| A generated directory or generator                               | `scripts/hooks/generated-file-guard.json` and `scripts/hooks/README.md`                                        |
