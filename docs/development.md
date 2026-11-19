# Development

Developer setup, running, testing and releases for Persistent. How the parts fit together is in [ARCHITECTURE.md](../ARCHITECTURE.md), and running the production server, backups and account deletion are in [deployment](deployment.md). The user-facing overview is the root `README.md`.

## Development

Initialise the shared promo submodule after cloning with `git submodule update --init --recursive`: the web build imports its public catalog contract, bundled manifest and icons, and the desktop build imports its WinUI page. Commit and publish promo changes first, then update Persistent's submodule pointer before publishing a consuming release.

The editor stays on the host. Devkit runs Node 22, PostgreSQL, and the Android
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

`validate` does not cover the native Kotlin. After editing `apps/mobile/android-plugin/`,
compile-check it with `npm run verify:android` (from `apps/mobile`); see
`apps/mobile/README.md`.

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
compile, including XAML. `npm run build:desktop` builds a signed dev MSIX and
`npm run install:desktop` updates it in place and launches it in the signed-in
Windows session. Builds use a disposable C: TEMP copy of the working tree;
tracked release versions stay unchanged. Read
[the shared Windows build guide](https://github.com/Dynamic-Solutions-Canada/windows-build-tools#readme) for prerequisites,
container delegation and package reuse. CI still compiles both architectures.

Compilation does not establish startup, packaging or UI behavior. Before committing
packaging or desktop runtime changes, install the working tree and check the changed
behavior. `npm run verify:desktop:csharp` retains the additional Linux non-XAML
compile check; it excludes generated XAML code and packaging.

`npm run dev` and `npm run dev:background` always enable `DEMO_MODE=true`,
including the container runtime. Local auth shows the sign-in code on screen
instead of emailing it, even when `.env` has mail credentials or disables demo
mode. Choose **Use email instead**, enter an address, then enter the displayed
code. Production Compose forces demo mode off.

For the Android app (build, wireless adb, signing), see `apps/mobile/README.md`.

### Multi-checkout development

[`@dynamic-solutions-canada/devkit`](https://github.com/Dynamic-Solutions-Canada/devkit#readme) 0.18.1 lets several repositories or linked worktrees run together
while the editor remains on the host. Each checkout gets a hostname and a private
Compose stack containing Node and PostgreSQL. Container ports stay fixed; the
published web port is derived from the checkout path.

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

`npm run dev:prepare-worktree` copies missing allowlisted local configuration,
ensures checkout-local dependencies, generates the Prisma client, and builds the
shared contracts. It is safe to repeat and does not start Docker, PostgreSQL,
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

| Command | Purpose |
| --- | --- |
| `npm run dev:prepare-worktree` | Prepare configuration, dependencies, Prisma and shared contracts without starting infrastructure |
| `npm run dev:background` | Start the development runner detached from its terminal |
| `npm run dev:down` | Stop this checkout's development runner and containers, preserving its database volume |
| `npm run dev:doctor` | Report every development prerequisite and its fix |
| `npm run dev:host -- snapshot` | Refresh the portable database baseline for new worktrees |
| `npm run dev:host -- reset` | Recreate a worktree database volume; add `--empty` to skip the baseline |
| `npm run dev:host -- prune` | Find volumes for deleted worktrees; add `--yes` to remove them |
| `npm run dev:host -- infra` | Restart the machine proxy and this checkout's PostgreSQL container |

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

Pushing a `vX.Y.Z` tag runs `.github/workflows/release.yml`, which builds the web
bundle, builds the signed Play AAB, generates changelog notes from the commits
since the previous tag, and ships one Android identity through both channels:

- **Play AAB to Google Play production.** Requires `PLAY_SERVICE_ACCOUNT_JSON`.
  Active phone testing releases are cleared in the same edit. Pre-flight rejects
  reused versionCodes before building; see `apps/mobile/store/play-readiness.md`.
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
