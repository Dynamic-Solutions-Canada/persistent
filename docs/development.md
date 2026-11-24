# Development

Developer setup, running, testing and releases for Persistent. How the parts fit together is in [ARCHITECTURE.md](../ARCHITECTURE.md), and running the production server, backups and account deletion are in [deployment](deployment.md). The user-facing overview is the root `README.md`.

## Development

Initialise the shared promo submodule after cloning with `git submodule update --init --recursive`: the web build imports its public catalog contract, bundled manifest and icons, and the desktop build imports its WinUI page. Commit and publish promo changes first, then update Persistent's submodule pointer before publishing a consuming release.

The editor stays on the host. Devkit runs Node 24, PostgreSQL, and the Android
SDK/JDK in a checkout-specific Compose stack and injects `DATABASE_URL` and
`API_PORT` into the development processes.

```bash
nvm install        # installs the exact Node release from .nvmrc
nvm use
npm install
npm run dev        # shared (watch) + api + web, concurrently
npm run db:migrate # apply Prisma migrations
npm run validate   # lint + test + typecheck + prisma validate
```

`npm run dev` waits for PostgreSQL and applies all checked-in Prisma migrations
before it starts the watchers. Schema changes still need a real migration from
`npm run db:migrate -- <name>`; startup never substitutes `db push` for migration
history.

Prisma 7 generates its TypeScript client into `apps/api/src/generated/prisma` (gitignored; `npm run db:generate`, which the API's `typecheck` and `build` also run), and the client reaches Postgres through the pg adapter. `apps/api/prisma.config.ts` gives the CLI its schema, migrations and `DATABASE_URL`, with a placeholder so `generate` and `validate` run without a database. Feature code imports `prisma` from `lib/prisma.ts`; scripts build a client with `createPrismaClient` from `lib/prisma-client.ts`, which owns the pool limits and keeps argument values out of Prisma's log lines. Prisma 7 refuses destructive commands such as `prisma migrate reset` and `prisma db push --force-reset` when an AI agent runs them, until a person consents: run those yourself, and never set the consent variable for an agent.

`validate` and `test` stay toolchain-free, so they run anywhere with Node. Three suites need a native toolchain and run as their own CI jobs, and in the gate of every publishing workflow, rather than inside `validate`:

- `npm run test:desktop`: the Windows app's portable localization harness, which needs the .NET SDK (in the development container).
- `npm run test:android`: the Android JVM unit tests in `apps/mobile/android-tests/`, which need the Android SDK and the generated Capacitor project.
- `npm run test:integration`: the database tests (`*.integration.test.ts`), which need a migrated PostgreSQL database whose name ends in `_test`, and fail rather than skip without one.

The unit run points `DATABASE_URL` at an unreachable placeholder and blanks the third-party keys, so no unit test can reach a real database or service through `.env`. After editing `apps/mobile/android-plugin/`, compile-check it with `npm run verify:android`, then run `npm run test:android`; see `apps/mobile/README.md`.

For a paired physical phone, the root `android:*` npm commands cover wireless
pairing, rotating-port discovery, direct-debug assembly, installation, launch,
and focused logcat output. `npm run android:test-device -- <phone-ip>` runs the
normal device smoke-test sequence. Pairing codes are transient and must not be
stored in repository configuration. Android builds use no persistent Gradle
daemon and at most two workers by default to keep WSL responsive; set
`ANDROID_GRADLE_WORKERS` only when the host has known spare capacity.

For repeatable Store screenshots without the personal phone, the experimental
[Firebase Test Lab workflow](test-lab-store-captures.md) defaults to a virtual
Android 16 phone, rejects billed projects, and uses a fresh synthetic-only server
with a temporary HTTPS tunnel. Its complete carousel is still gated on real alarm
escalation and removal of unrelated lab icons. Ordinary development databases,
production credentials and cached personal data must never be exposed by this path.

The `test-android-device` skill follows that same physical-device
workflow. A Claude Code hook ([scripts/hooks](../scripts/hooks/README.md)) rejects edits to generated files
and to `apps/mobile/android/`; change the tracked native overlay or setup script
and regenerate instead.

`validate` does not cover the Windows desktop app either. From WSL,
`npm run verify:desktop` uses the shared build bridge for a full Windows Debug
compile, including XAML. `npm run package:desktop:dev` builds a signed dev MSIX and
`npm run install:desktop` updates it in place and launches it in the signed-in
Windows session. Builds use a disposable C: TEMP copy of the working tree;
tracked release versions stay unchanged. Read
[the shared Windows build guide](https://github.com/Dynamic-Solutions-Canada/windows-build-tools#readme) for prerequisites,
container delegation and package reuse. CI still compiles both architectures.

To build for Windows from inside the development container, set two values in your `.env`: `WINDOWS_BUILD_TOOLS` (the host path of your windows-build-tools checkout, which Compose mounts read-only) and `PERSISTENT_WINDOWS_HOST` (the SSH alias of the Windows host). Neither has a default, so no machine path lives in a tracked file; with them unset, Windows builds are unavailable inside the container and still work from WSL.

Compilation does not establish startup, packaging or UI behavior. Before committing
packaging or desktop runtime changes, install the working tree and check the changed
behavior. `npm run verify:desktop:csharp` retains the additional Linux non-XAML
compile check; it excludes generated XAML code and packaging.

`npm run dev` and `npm run dev:background` always enable `DEMO_MODE=true`,
including the container runtime. Local auth shows the sign-in code on screen
instead of emailing it, even when `.env` has mail credentials or disables demo
mode. Choose **Use email instead**, enter an address, then enter the displayed
code. Production Compose forces demo mode off.

Sign-in codes stay rate limited in development: five per address and twelve per IP address in fifteen minutes. Browser and device checks therefore sign in once per session rather than once per run. Keep the Android app installed through a check (it keeps its session), and give Playwright a saved session: `npm run dev:session -- --origin=http://localhost:<web port>` signs `demo@example.test` in, or reuses its saved session while it still works, and writes a Playwright storageState file to `tmp/dev-session/demo.json` (git-ignored) for `browser.newContext({ storageState })`. It accepts only a local origin and the demo account. The app-store review account (`REVIEW_ACCOUNT_*`) stays unset in development; it is a production credential that is live only during a store review.

For the Android app (build, wireless adb, signing), see `apps/mobile/README.md`.

### Multi-checkout development

[`@dynamic-solutions-canada/devkit`](https://github.com/Dynamic-Solutions-Canada/devkit#readme) 0.18.1 lets several repositories or linked worktrees run together
while the editor remains on the host. Each checkout gets a hostname and a private
Compose stack containing Node and PostgreSQL. Container ports stay fixed; the
published web port is derived from the checkout path.

Copy `.env.dev.example` to `.env` first; every value in it is optional. Production settings are in `.env.server.example` (see [deployment](deployment.md)).

```bash
npm run dev:bootstrap          # once per machine
npm run dev:prepare-worktree   # prepare this checkout without starting Docker
npm run dev:host -- snapshot   # once in the primary checkout, capture its database baseline
npm run dev
```

On first start, a worktree copies the primary checkout's `.env` only when it has none, replaces a
missing or shared dependency tree with a checkout-local `npm ci`, restores the portable database
baseline, applies migrations added by its branch, and prints both its proxied `*.localhost` URL and
direct Vite URL. A standalone clone still needs an initial `npm install` to install Devkit itself.
Persistent has no filesystem baseline paths, so snapshots contain database state only.

`npm run dev:prepare-worktree` copies missing allowlisted local configuration and
ensures checkout-local dependencies (`devkit prepare`), then runs this repo's
`dev:postprepare`, which generates the Prisma client and builds the shared contracts. It is safe to repeat and does not start Docker, PostgreSQL,
the proxy, or the app. Preparation and development automatically select the Node
version in `.nvmrc` from an existing nvm installation and check the pinned npm
version, even when Paseo's shell uses a newer Node by default. They do not install
a runtime or change the machine's default. Install the pinned runtime once with
`nvm install` if it is absent, or use the development container.
Before a fresh checkout has dependencies, it uses the
`devkit` PATH link installed by the machine bootstrap. A standalone clone without
that link needs an initial `npm install`.

Starting development leaves the browser closed by default. Use
`npm run dev -- --open`, `--open=native`, or `--open=vscode` to opt in. Devkit
checks API readiness before an explicitly requested browser opening.

Only one dev runner can own a checkout. To detach it from the terminal, use
`npm run dev:background`; Devkit reports the runner PID and its log path.
That confirms preflight, not application readiness. `npm run dev:down` stops
the runner and tears down its checkout stack. Other checkouts run independently.

The snapshot, rather than `db:seed`, supplies a new worktree's initial users and
reminders. `npm run db:seed` remains an explicit operation against the current
checkout's database. Seed changes do not refresh the baseline automatically;
run `npm run dev:host -- snapshot` in the primary checkout when those changes
should reach future worktrees.

Passkeys are deliberately hostname-specific. A credential registered for
`localhost` cannot authenticate at `persistent.localhost`, and a credential for
one worktree hostname cannot authenticate at another. Cloning its database row
does not change that browser/WebAuthn binding, so use email-code sign-in and
register a passkey separately on each hostname where one is useful.

| Command                        | Purpose                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `npm run dev:prepare-worktree` | Prepare configuration, dependencies, Prisma and shared contracts without starting infrastructure |
| `npm run dev:background`       | Start the development runner detached from its terminal                                          |
| `npm run dev:down`             | Stop this checkout's development runner and containers, preserving its database volume           |
| `npm run dev:doctor`           | Report every development prerequisite and its fix                                                |
| `npm run dev:host -- snapshot` | Refresh the portable database baseline for new worktrees                                         |
| `npm run dev:host -- reset`    | Recreate a worktree database volume; add `--empty` to skip the baseline                          |
| `npm run dev:host -- prune`    | Find volumes for deleted worktrees; add `--yes` to remove them                                   |
| `npm run dev:host -- infra`    | Restart the machine proxy and this checkout's PostgreSQL container                               |

`npm run dev:down` removes this checkout's containers and network while preserving its
database volume.

Reset refuses to operate on the primary checkout because it owns the source
database for snapshots.

### Paseo workspace scripts

`paseo.json` uses the same setup and teardown commands for worktree lifecycle
hooks. Paseo prepares a new worktree with `npm run dev:prepare-worktree` and
runs `devkit cleanup --paseo --yes` before removing it. Archive cleanup removes private
worktree volumes only after the final active workspace reference is archived; ordinary
`npm run dev:down` preserves them. Setup does not start the application;
run the `dev` script when you want to use it. Both hooks and all Scripts menu
commands use the pinned runtime wrapper, so they do not depend on Paseo's host
Node version or an interactive shell's nvm setup.

`devkit-init` writes the dev runner (`scripts/dev/run-dev.mjs`), the `dev` and lifecycle npm scripts, `paseo.json` and the edit guard, and `npm run check:devkit` (part of `validate`) fails when one is stale or hand-edited; run `npm exec devkit-init` after every devkit bump. Inside the container the runner hands over to this repo's `dev:container` script: wait for the database, generate the Prisma client, apply migrations, build the shared package, then start the shared, API and web dev servers. Change those steps there, never in the runner.

The Scripts menu exposes `dev-prepare-worktree`, `dev`, `dev-background`,
`dev-down`, `dev-doctor`, `validate`, `test`, and `build`. Prefer the supervised
foreground `dev` script when using Paseo's Start/Stop controls. The background
variant stays detached; stop it with `dev-down`.

Devkit owns checkout ports and proxy URLs, so these scripts do not ask Paseo to
allocate a second service port. The runner prints the proxied and direct URLs.
`build` compiles the application; `validate` checks it. Neither deploys it.
Resetting databases, refreshing snapshots, pruning volumes, bootstrapping the
machine, and deploying remain explicit operations outside automatic hooks.

## Releases & updates

Persistent has one product version, the root `package.json`, with `apps/web` kept equal; only the `release` skill bumps it, committing that version's notes in `release-notes/` with it (see [its README](../release-notes/README.md)). Tags follow REL-3:

| Tag              | Means                | Made by                            | Starts              |
| ---------------- | -------------------- | ---------------------------------- | ------------------- |
| `vX.Y.Z`         | The deployed product | The `deploy` skill, after a deploy | Nothing             |
| `android-vX.Y.Z` | An Android release   | The `release` skill                | `release.yml`       |
| `desktop-vX.Y.Z` | A Windows release    | By hand, after the Windows bump    | `build-msix.yml`    |
| `linux-vX.Y.Z`   | A Linux release      | The `release` skill's Linux lane   | `release-linux.yml` |

The deploy refuses a version that already has a `v` tag, so shipping new web or server changes starts with a bump. Tags up to `v0.30.1` are Android releases from before the Android lane, and are never moved or reused.

### Android releases

Pushing an `android-vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds the web bundle and the signed Play AAB, and ships one Android identity through both channels with that version's approved notes (`release-notes/android-X.Y.Z.md` and its six translations). It stops before building when any wording is missing or too long; notes are never generated from commits.

How the Android version is derived today (D-059 keeps this scheme on devices already installed):

- **versionName** is the tag without its prefix: `android-v0.31.0` gives `0.31.0` (releases up to `v0.30.1` dropped the `v`). It is equal to the root `package.json` version, which the `release` skill bumped in the commit the tag sits on.
- **versionCode** is the workflow's run number plus the `PLAY_VERSION_CODE_OFFSET` repository variable (unset means 0). It must only grow; the "Pre-flight Play release" step refuses a code Play already has and prints the offset to set. Raise the offset only, never lower it.
- CI passes both as `ANDROID_VERSION_NAME` and `ANDROID_VERSION_CODE`, and `apps/mobile/scripts/setup-android.mjs` writes them into the generated `app/build.gradle`. Nothing in the repo stores them; a local build without those variables keeps the Capacitor template's placeholder version.

The two channels:

- **Play AAB to Google Play production.** Requires `PLAY_SERVICE_ACCOUNT_JSON`.
  Active phone testing releases are cleared in the same edit. Pre-flight rejects
  reused versionCodes before building; see `store-assets/play/play-readiness.md`.
- **Google-signed Play APK to GitHub Release.** After Play generates a universal
  APK, CI downloads it and verifies its package, version and registered Play
  signing certificate before publishing `persistent-X.Y.Z-play.apk`. There is
  no direct-APK fallback. Users can update through Google Play or manually install
  newer GitHub APKs; using the Store is optional.
- **Legacy direct installs:** a one-time opening notice and Settings guidance
  explain why the new APK installs separately and the loss of Android Auto.
  Both GitHub downloads and Google Play are offered as equal options. The old updater
  endpoint returns `null` to prevent incompatible install offers. Existing saved
  reminders are available after signing into the same account.
- **Existing uploads:** the manual `play-promote` workflow moves an uploaded
  versionCode to production without rebuilding and retires phone testing releases.
  It can also adjust a production rollout and refuses a downgrade.

Because the app loads the UI from production, web-only changes ship via a deploy
with no new build; cut a release only for native changes (alarm/update/passkey/
Google plugins, manifest, icon).

### Linux desktop releases

Linux uses a separate standalone package and `linux-vX.Y.Z` tags. It does not bump
or publish the Android or Windows binary. Read
[Linux build/install/update instructions](../apps/linux-desktop/README.md).
`release-linux.yml` validates the main-branch tag/version, builds x64 and ARM64
AppImages, then publishes a complete draft with the shared checksum
manifest before making it public. The Linux desktop check packages both architectures
on their native CI runners before release tagging. Android remains GitHub Latest.

Keep the Linux asset names: installed copies find their update by the exact name `Persistent-Linux-<version>-<cpu>.AppImage` (`apps/linux-desktop/src/release-check.ts`, written by `scripts/release-manifest.ts`). They predate the shared `<Product>-<version>-<platform>-<arch>` pattern (LAYOUT-12), and a rename must attach both names for at least one release.

Deploy the hosted Linux bridge before publishing the Linux release. Root validation
uses root transport test dependencies; Linux tooling requires
its standalone install under the same pinned Node runtime. Native tests use isolated profiles and
synthetic data. Build evidence does not replace desktop runtime evidence.

## Agent skills (`.agents/skills/`)

Claude Code reads them through the `.claude/skills` symlink.

- `commit`: review (docs, data isolation, and logging), validate, and commit.
- `deploy`: `commit`, then push and deploy through SSH and Docker.
- `release`: derive the next version from changes since the last release, tag,
  and let CI publish the AAB to Google Play production and the verified
  Google-signed universal APK to GitHub.
- `audit-docs`: resync all docs and project guidance with the code.
- `verify`: observe web behavior or run the appropriate Android/desktop check.
- `desktop`: build, verify or install the working tree through the shared Windows bridge.
- `store-screenshots`: prepare synthetic data and refresh both stores' images using
  Paseo and the actual Windows flyout. See [the repeatable workflow](../store-assets/README.md).

## Docs

[ARCHITECTURE.md](../ARCHITECTURE.md) is the overview and links each subsystem document in `docs/`. Dated reviews and verification records are in `docs/notes/`. Directory-scoped conventions are in the scoped `AGENTS.md` files, and reusable workflows and agent guides live under `.agents/`.

## Patched build runtimes

Use the exact Node and npm versions in the root manifest for production, development and Linux build tooling. Desktop SDK selection lives in `apps/desktop/global.json`: SDK 10.0.403 or a newer stable .NET 10 feature band is eligible. Self-contained builds reject resolved .NET runtime packs older than 10.0.14. These build requirements address CVE-2026-111497; existing deployed images and native packages require separate rebuilds and releases. See [HTTP2Shell review](notes/http2shell-review.md) for evidence and remaining gates.

## CI

`.github/workflows/ci.yml` ("CI") runs on every push to `main` and every pull request, with no path filter: `npm run validate`, `npm run test:integration` against a PostgreSQL service, `npm run test:desktop` and `npm run test:android`, each as its own job. Every publishing workflow (`release`, `release-linux`, `build-msix` on a tag, `store-publish`, `play-apk`, `play-promote`) calls it as its first job and publishes only once it passes, building the same ref. `play-listing` and `play-notes` publish store text (and, opt-in, the listing screenshots), so their gate is `npm run check:listing` or `npm run check:release-notes` instead. `codeql.yml` scans TypeScript, C# and the workflows on push, pull request and weekly. Extra path-filtered workflows (`linux-desktop-check`, `image-check`) build expensive targets beside it, never instead of it.

## App icons

The bell mark's masters are in `assets/brand/`: `icon.svg` (the rounded tile), `icon-maskable.svg` (full bleed, for maskable web icons and, through `appleTouchMaster` and `playMaster`, the iPhone and Play icons) and `icon-mono.svg` (the white silhouette for Android's themed and notification icons and, drawn dark, the Windows light-taskbar icon). `assets/brand/icons.json` lists the targets. `npm run icons` (devkit-icons) writes every web icon in `apps/web/public/`, the Android launcher and notification icons in `apps/mobile/android-res/`, the Play icon `store-assets/play/graphics/icon.png`, the Windows app's `.ico` and in-app PNG in `apps/desktop/Persistent.Desktop/Resources/` and its MSIX images (including the Start tiles the manifest declares) in `apps/desktop/Persistent.DesktopMSIX/Images/`, and the exports in `assets/generated/`, which the README and the Linux app use. `npm run check:icons`, part of `validate`, fails when a committed icon no longer matches its master. Change a master, run `npm run icons`, and bump `ICON_VERSION` in `apps/web/vite.config.ts` and `index.html` so installed web apps refresh.

The first Microsoft Store screenshot in each listing locale is a generated hero (D-123): `npm run hero` (devkit-store-hero) draws it from the tray flyout capture, the icon and each locale's `heroHeadline` and `heroSubline` in `store-assets/microsoft/listings.json`, and `npm run check:hero`, part of `validate`, fails when a committed hero no longer matches them. The first run downloads devkit's pinned fonts (about 27 MB) into the user's cache. See `store-assets/README.md`.

The masters are flat filled paths only, because devkit's Android vectors accept nothing else: the motion lines are solid `#416397`, which is the old 55% opacity of `#6ea8fe` over the `#0b0f19` tile. The Windows widget picker preview (`Images/WidgetScreenshot.png`) is a picture of the card, not an icon: `generate-widget-screenshot.ps1` renders it at build from the committed in-app PNG, and it is gitignored.

## Third-party notices

`npm run notices` (devkit-notices) writes the notices for what ships to users, from the `notices` block in `devkit.config.mjs`: `apps/web/public/THIRD-PARTY-NOTICES.txt` for the web app, which every host shows at Settings > About > Third-party notices, and `apps/linux-desktop/THIRD-PARTY-NOTICES.txt`, which the AppImage ships beside Electron's own licence files. Run it after any production dependency change and commit the result. `npm run check:notices`, part of `validate`, checks the web file; `linux-desktop-check.yml` checks the Linux file on its x64 leg, because it needs that package's own install. The files are generated from the Linux x64 closure, so check them on Linux x64 (WSL or CI); the arm64 AppImage differs only in its native binary packages. The API image runs only on our server and is not distributed, so it has none. The root `NOTICE` names both files.

The Android app builds its own notices: AboutLibraries (pinned in `setup-android.mjs`) collects each dependency's licence, and `apps/mobile/android-plugin/third-party-notices.gradle` renders them to `assets/third_party_notices.txt` in every variant, which the notices page shows after the web list through `AlarmPlugin.readNotices`. The build fails on a licence outside its allowlist, on a dependency with no licence, and when the list misses a module on the variant's runtime classpath. `npm run check:android-notices` renders every variant, and `npm run lint:android` runs Android lint (errors fail, warnings do not); CI's Android job runs both.

The Windows app's notices come from winui-app-kit's generator (the `apps/desktop/external/winui-app-kit` submodule, pinned to a tag) and its NuGet restore graph: `npm run generate:notices:desktop` writes `apps/desktop/Persistent.Desktop/THIRD-PARTY-NOTICES.txt` and `npm run check:notices:desktop` checks it, which CI's Windows harness job runs after a restore. Both need a fresh restore; without a local .NET SDK, restore in a disposable `mcr.microsoft.com/dotnet/sdk` container with the NuGet cache mounted at the same path inside and out, so the script can read the packages' licence files. Regenerate after any package or kit pin change.

## The 2026-11-19 history rewrite

Commit metadata and old file contents were rewritten on 2026-11-19 to replace two personal email addresses with the GitHub noreply address. Every clone made before then must re-clone, or fetch and `git reset --hard origin/main`; never push the old history back. The rewrite also changed the applied migration `20261007120000_admin_statistics` (one address in an `UPDATE` that matches no rows on a new database), so a development database that applied it before the rewrite reports drift on `prisma migrate dev`. Fix it without a reset by setting that row's checksum to the file's current SHA-256: `UPDATE "_prisma_migrations" SET checksum = '<sha256sum of migration.sql>' WHERE migration_name = '20261007120000_admin_statistics';`, or recreate the database. Production applies migrations with `migrate deploy`, which does not re-check applied checksums.

## Install scripts (npm 11)

npm 11 runs a dependency's install script only when the root `package.json` approves its exact version in `allowScripts` (PLAT-10); an unapproved one is skipped with a warning. Approved: Prisma's engines, CLI and client, and esbuild. Denied: lefthook (its hook is installed by `dev:postprepare`). `apps/linux-desktop` has its own list. The keys name exact versions, so bumping an approved package re-approves it in the same commit: `npm install-scripts approve <name>` (it pins every installed version of that package).

## TypeScript

The root holds the only compiler for the workspaces: `@typescript/native` is TypeScript 7 and provides `tsc`. The root `typescript` entry is an alias to `@typescript/typescript6` (its command is `tsc6`), present only because typescript-eslint's peer range stops below 6.1; remove it once typescript-eslint supports TypeScript 7. `apps/linux-desktop` has its own lockfile and depends on TypeScript 7 directly. `apps/mobile` has its own lockfile and the same pair as the root: the Capacitor CLI loads `capacitor.config.ts` through the `typescript` package's JavaScript API, which TypeScript 7 does not have. TypeScript 6 and later no longer load every installed `@types` package, so a tsconfig that needs Node's types lists `"types": ["node"]`.

## Formatting

Prettier formats the TypeScript, JavaScript, JSON, YAML, CSS, HTML and Markdown with the shared house style (`.prettierrc.json`: single quotes, no semicolons, Markdown prose left unwrapped). `npm run validate` runs `npm run format:check`; when it fails, run `npm run format` and commit the result. `.prettierignore` lists what stays untouched. The Windows app's C# gets `dotnet format` when it moves to winui-app-kit. To have `git blame` skip the one-off reformat, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once.

## Git hooks

`lefthook.yml` runs devkit's shared `devkit-precommit` before every commit (HYG-10). It refuses staged signing material and keys, `.env` files other than `*.example`, anything under `.secrets/`, text containing a private key, and files over 5 MB; the one store video above that size is exempt from the size check only. npm 11 does not run lefthook's own install script (it is denied in `allowScripts`, PLAT-10), so `npm run dev:postprepare`, which worktree preparation runs, installs the hook with `lefthook install`; in an existing checkout run `npx lefthook install` once. `git commit --no-verify` skips it, so treat it as a guard, not a wall. The Claude Code edit guard in [scripts/hooks](../scripts/hooks/README.md) separately keeps agents off generated files.
