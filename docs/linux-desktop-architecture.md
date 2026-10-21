# Linux desktop architecture

`apps/linux-desktop` is the Linux equivalent of the Windows tray host. It uses
Electron because the hosted management UI remains the product, while the resident
main process can own native delivery independently of page visibility. No reminder
schedule, checklist wording or escalation eligibility is implemented in this host.

## Presentation language

Native tray menus, recovery/settings windows, update text and notification actions use the canonical catalogs. A validated additive page message persists the per-device language/formatting payload, refreshes visible host copy and notification presentation, and requests the server projection with the resolved language. User-authored notification content remains literal, except the server-designated escalation marker. These settings contain no credentials and do not change scheduling, action authorization or account clearing. Desktop build/source proof is separate from native OS runtime acceptance; see [localization](localization.md).

## Product behavior and boundaries

The initial compatibility target is KDE Plasma and GNOME with AppIndicator support,
on X11 and Wayland. The flyout is created once and reused, preserving its current
page, dialogs and drafts. Closing hides it; quitting ends the resident process.
A second launch reopens the first instance. Start at sign-in is opt-in, reported
from the current freedesktop autostart entry rather than a saved boolean.

The frameless flyout follows the Windows layout: a 36-pixel draggable strip with
Back on the left, and Pin, Reload, Open in browser and Close icon buttons on the
right. The web app supplies its own brand header. The strip follows the hosted
page's resolved theme. Pin prevents light dismiss; explicit Close still hides it.
Back uses the same page hierarchy as Windows and Android. The tray menu matches
Windows: Open Persistent, Open in browser, Reload, Settings and Exit, with the
same separators. Activation toggles the flyout, with the same 350-millisecond
light-dismiss suppression. GNOME's AppIndicator extension can force single click
to open the menu and double click to activate; this approved desktop exception
does not install a companion extension.

Settings opens a separate native window with Windows-style Connection, Our other
apps, About and Settings navigation. Its theme and remembered geometry are separate
from the hosted app. Connection includes save/reload, reset and confirmed sign-in
clearing. About checks only releases carrying a Linux package for the current CPU,
automatically or when requested, with separate download and installation consent,
and offers source, privacy and log links. Publisher cards reuse the
shared catalog, with actions below their descriptions.

Both windows have an 8-DIP rounded frame and thin border. The default X11 backend
uses standard additive EWMH taskbar/pager exclusion requests after mapping, without
changing the normal window type or disabling resize/maximize. Minimize hides
Settings so it remains recoverable through the tray. The X11 connection is bounded
and uses the user's existing Xauthority; no extension or command-line tool is needed.

X11 positioning uses reported tray bounds or activation coordinates to choose the
nearest work-area corner, inset by 12 DIP like Windows. If icon geometry is absent,
the cursor chooses the monitor and its reserved panel edge chooses the corner.
It clamps to the work area. Saved and centered placement remain available.
Native Wayland does not support absolute top-level positioning: its compositor
chooses placement. X11/XWayland is the approved default for closer Windows flyout
parity and requires an available X server. Explicit `--ozone-platform=wayland`
chooses native Wayland; `--ozone-platform=x11` selects X11/XWayland explicitly.
Native Wayland also leaves taskbar treatment and window capabilities to the
compositor; use the default XWayland backend for the verified Windows parity.
New profiles use the Windows 420-by-960-DIP Tall flyout; saved sizes are preserved.

Electron can initially select a legacy tray adapter if the StatusNotifier watcher
is absent, including a launch during screen lock. A bounded ten-second monitor
recreates the adapter when the watcher returns. If no watcher exists at autostart,
the window opens as a recovery route. GNOME needs an AppIndicator extension for a
tray icon. The launcher and local Connection/About window remain available.

Unlike WebView2, this Electron host does not claim full hidden-page suspension.
The hidden renderer uses Chromium's normal background throttling. Native notification
and audio delivery do not rely on its JavaScript timers or WebSocket. Reopening
posts the existing freshness/build-update message without recreating the page.

## Native presentation

Notifications are off by default. Enabling requires a session D-Bus notification
service that reports action support. Failure leaves the toggle off. The app reads
`/api/sync/occurrences?alarmsOnly=true`, validating every alarm against
`@persistent/shared`, and selects entries due at the server's reported time.
A due `::esc` twin upgrades the same occurrence rather than creating another item.

A main-process `/ws` connection supplies invalidation. Recovery runs at startup,
reconnect, resume and every minute. Failed or malformed reads retain existing
obligations; missing/expired authentication, logout and account transitions clear
them. Overlapping requests are coalesced and late account responses are discarded.
A network failure never becomes an empty projection.

The native surface implements the same outcomes as Windows:

- One notification per occurrence, with server-formatted title and body.
- Done replaces it with Confirm done / Not yet. Only Confirm posts `ack`.
- Snooze opens the web app's existing full picker, over the current screen, without
  replacing an editor draft. It waits for the authenticated listener and shared
  freshness gate. Duration selection, exact-until and offline queuing stay in the web.
- De-escalate is offered only when the server projection permits it. `silence`
  succeeds through the API, then a refreshed projection determines the next state.
- A cross-device dismiss clears the matching notification and updates audio.
- Expiry/dismissal restores a live notification after the five-second monitor delay.
  Restoration is quiet; the configured server nag interval explicitly re-alerts.
- A refused or unknown-outcome action retains the obligation and is reported.
  Writes are not automatically retried after uncertain delivery.

Freedesktop urgency, resident, persistent and sound hints are requests to the daemon,
not guarantees about popup duration, notification history or DND. GNOME and KDE can
render actions differently. RPC targets are pinned to the unique notification
daemon owner; opaque application handles prevent a restarted daemon from reusing
an ID in delayed cleanup or actions. Linux notifications have no standard snooze dropdown;
opening the existing web picker is the approved interaction.

A separate local sandboxed renderer loops a bundled fallback tone while any active
projection entry is an alarm. It survives hosted-page hiding/reload and stops after
accepted completion, snooze, de-escalation, logout, disable or quit as determined by
the server projection. Audio renderer failure has a recovery path. Android tone URIs
are not loaded as arbitrary local files; Linux uses the bundled fallback, as Windows
uses its platform alarm sound. Soft alerts request the desktop notification sound.
Actual audibility depends on the user's output device, volume and desktop policy.

Nothing can guarantee a new firing through process exit, machine sleep, shutdown
or an unavailable server. Previously known obligations can remain active offline;
this host does not schedule exact offline wake alarms. Android remains the hard
alarm guarantee.

## Authentication and IPC

The hosted view has its own persistent Chromium profile. Native API calls use that
same session's network stack; the socket borrows its current HttpOnly session cookie
per connection. Credentials are never exposed to the page bridge or written into
settings. An in-memory SHA-256 identity distinguishes token replacement from sliding
cookie expiry without retaining another usable credential. Expiry-only cookie refresh
must not interrupt alarm audio. Logout invalidates pending publication/action work
before account data can change. Complete local sign-in clearing first unloads the
hosted page and then clears profile storage, HTTP cache and auth cache.
An online sign-in confirmation resumes native delivery only after the hosted app
has completed prior-account cleanup, including on first sign-in and account changes.

This follows Windows' authenticated profile model. There is no new FCM subscription,
server device identity, credential mirror or reminder scheduling API. The hosted
session reports the Linux app/platform through the existing client-usage contract.
Google sign-in stays inside a constrained sandboxed popup. Only the configured app
origin and Google's exact HTTPS account origin can navigate that popup. Other HTTPS
links open externally only after a trusted link activation or local user action.
Redirects and script-created external popups are blocked. Authentication popups
receive only the trusted-link preload, never the management bridge. Browser/PWA notifications remain
absent.

Hosted IPC validates the exact managed webContents, main frame and configured origin.
The local toolbar and recovery/audio pages have separate transports and exact packaged
URL checks. All renderers use context isolation, sandboxing and no Node integration.
Permissions are denied by default. The preload exposes only a bounded message channel,
not IPC itself. Unknown messages do nothing. Settings patches validate known values and
always echo the host's actual state, including a native registration failure.

## Packaging and workflow

The standalone npm package follows the mobile wrapper's separation from the root
workspace graph. Shared schemas are bundled into the main process; maintained
D-Bus, WebSocket and X11 clients remain native runtime dependencies. The tray uses
an existing Persistent mark. D-Bus receives a physical extra-resource icon because a
notification daemon cannot read Electron ASAR paths.
Local settings use a separate bundled icon copy because packaging moves the
notification extra-resource icon out of ASAR.

Root commands cover build, package, typecheck and a user-level AppImage installer.
Packaging emits x64/ARM64 AppImage and Debian artifacts; portable tar downloads
are not offered. The installer
checks ELF/AppImage CPU identity, atomically replaces the owned image and launcher,
and preserves profiles. The app reads live freedesktop autostart state, including
external Hidden/X-GNOME disable overrides. Automatic checks and manual update controls share one consent-gated controller.
Downloads require approval, and installation/restart requires a second approval.
Quitting never silently installs. Metadata and payloads come only from the official
Linux release channel; size, SHA-512 and CPU/package identity are verified before
replacement. The AppImage is replaced through a private staging directory and
atomic rename. Debian uses polkit and apt with removals forbidden. Profile data
never enters the updater. There is no automatic browser opening.

Linux build tools require Node 22.12+ because current Electron requires it. This does
not change the existing Node 20 web/API environment. Root validation includes Linux
unit tests; Linux's separate typecheck/build and native package/runtime checks are
still required. Windows sources, build commands, Store identity and release lanes are
unchanged. Ship the updated hosted bridge before distributing the Linux host.

## Verification record

The worktree's native smoke-test record is
[`linux-desktop-verification.md`](linux-desktop-verification.md). Treat package builds,
protocol observations, actual renderer/audio state, and visible desktop observations
as separate evidence. KDE, real authenticator/Google login and actual sleeping-machine
behavior require their own checks. There is no Linux equivalent of the Windows 11
widget provider or Microsoft Store updater in this initial host; those are platform
integrations rather than duplicated reminder surfaces.
