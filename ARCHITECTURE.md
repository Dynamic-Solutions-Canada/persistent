# Architecture

How Persistent's server, web app and native hosts fit together. Each large subsystem has its own document, linked below; this file is the overview and the list of where the product keeps data.

## Parts

- **`apps/api`:** Express, Prisma, PostgreSQL and a per-user WebSocket, plus the scheduling and escalation engine that turns reminders into occurrences and delivers pushes and emails.
- **`apps/web`:** the Vite, React and Joy UI PWA. It is the only UI codebase; every native host shows it.
- **`apps/mobile`:** the Capacitor (Android) wrapper that loads the web UI and adds native plugins: a custom alarm plugin (foreground service, exact alarms, full-screen alarm, looping sound), a passkey and Credential Manager bridge, and Google sign-in. See `apps/mobile/README.md`.
- **`apps/desktop`:** the WinUI 3 (C#) Windows tray app. It hosts the deployed web UI in a WebView2 flyout and adds session-bound persistent notifications and alarm audio while the PC is awake and the process is running.
- **`apps/linux-desktop`:** the Electron Linux tray host, with the same model as the Windows app.
- **`packages/shared`:** the Zod schemas and inferred types shared by the API, the web app and the hosts.

Production is one Docker image serving the API and the built web app on one origin, plus PostgreSQL; see [deployment](docs/deployment.md).

## The persistence model

Undismissable notifications and repeating alarm sound while the app is closed are native-OS capabilities, not web ones. So:

- The **web app** is the management surface and sends no notifications.
- The **Windows and Linux apps** alert persistently while their tray process runs and the computer is awake, but cannot guarantee delivery through sleep or shutdown.
- The **Android app** is where the real guarantee lives.

Reminders fire offline through device-scheduled local alarms synced from the server, which is the source of truth; server push (FCM) is the cross-device, escalation and ad-hoc backup. Details: [alarm architecture](docs/alarm-architecture.md) and the user-facing guarantee in [notification behaviour](docs/notification-behavior.md).

## Auth

Passwordless: a one-time email code, a passkey, or Sign in with Google (when `GOOGLE_WEB_CLIENT_ID` is configured). All resolve to the same account by email. See [auth architecture](docs/auth-architecture.md).

## Sync model

The server owns the truth; clients hold a mirror. Reads go over HTTP (TanStack Query, with the cache persisted for offline reads). Writes apply optimistically and queue while offline, replaying after the account is confirmed on reconnect. Full-editor saves compare the server version that was opened, and focused text edits compare the original field or item text; a conflict returns 409 rather than overwriting a newer edit, and the open editor keeps its draft. Independent checklist operations preserve one another. Live updates arrive over the per-user WebSocket. The native clients also pull occurrences to schedule on-device alarms and send acknowledgements and snoozes back. First opening and foregrounding wait for fresh data; a previously signed-in account can reopen its saved personal data offline for up to seven days, with a visible offline status. See the [data and event contract](docs/data-event-contract.md).

## Settings and the app catalog

Language, regional formatting and time format share the Language and region card. Account details, passkeys, sign-out and permanent deletion share the Account card. Help sits directly before Privacy, and Apps is the final card.

"Our other apps" hides Persistent by its stable product ID and labels every other app by platform, including Windows apps whose HTTPS Store links open on Android. Its catalog refresh from the public apps-promo repository on GitHub is optional and sends no account credentials. Bundled content and the last valid catalog stay available offline, and a failed refresh never blocks startup or shows an account error. New remote icons are cached by the service worker; bundled icons are precached with the web build.

## Subsystem documents

| Document | Covers |
| --- | --- |
| [docs/alarm-architecture.md](docs/alarm-architecture.md) | Device scheduling, FCM backup, escalation, the Android alarm plugin |
| [docs/notification-behavior.md](docs/notification-behavior.md) | The done, silence and snooze guarantee every surface must keep |
| [docs/auth-architecture.md](docs/auth-architecture.md) | Sessions, passkeys, Google sign-in, data isolation, sharing and assignment grants |
| [docs/data-event-contract.md](docs/data-event-contract.md) | HTTP and WebSocket data flow, offline queueing, conflicts |
| [docs/desktop-architecture.md](docs/desktop-architecture.md) | The Windows tray host, its notifications, packaging and widget |
| [docs/linux-desktop-architecture.md](docs/linux-desktop-architecture.md) | The Linux tray host and its packaging |
| [docs/localization.md](docs/localization.md) | Catalogs, locales and native resource packaging |

## Where data lives

What each part writes, and what remains when it is removed. Backup, export and account deletion are in [deployment](docs/deployment.md#backup-export-and-deletion).

| Part | Writes | After removal |
| --- | --- | --- |
| Server | PostgreSQL in the `persistent-data` Docker volume (accounts, reminders, occurrences, shares, assignments, push registrations, sessions, passkeys); the FCM service-account key in the host's `.secrets/`; container logs | Account deletion removes the account's rows; see deployment |
| Web app | The browser's `localStorage` (the persisted query cache, the offline account profile, per-device display settings) and the service worker cache, all for the app's origin | Signing out or deleting the account clears that account's cached data; clearing the site's data removes the rest |
| Android | App-private storage (the WebView profile with the session, the native alarm store and settings). Android backup is off (`allowBackup="false"`), so nothing goes to a cloud backup | Uninstalling removes it all |
| Windows (Store, MSIX) | `%APPDATA%\Persistent`: `settings.json`, the `WebView2` profile (session cookie and offline cache) and log files. The startup entry is the package's startup task | Packaged writes to AppData are redirected into the package's folder, which Windows deletes on uninstall. Unconfirmed: a real uninstall has not been checked, and a `Persistent` folder that already existed from a portable build is written in place and survives |
| Windows (portable ZIP) | The same `%APPDATA%\Persistent` folder, and with Start at sign-in a value under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` | Deleting the folder you unzipped removes only the app. The AppData folder and the Run value remain until removed by hand (turn off Start at sign-in first) |
| Linux (AppImage) | `~/.config/persistent-linux` (settings, the Chromium profile with the session, logs, downloaded updates). With `--install`: `~/.local/share/persistent-linux/` (the AppImage and its icon) and `~/.local/share/applications/ca.persistent.desktop.desktop`. With Start at sign-in: `~/.config/autostart/ca.persistent.desktop.desktop` | Deleting the AppImage removes only the app; the folders and desktop entries above remain until removed by hand. Paths follow `XDG_CONFIG_HOME` and `XDG_DATA_HOME` when they are set |
