# Persistent for Linux

A resident tray app hosting the same Persistent web UI as Windows. Notifications
are optional and off by default. It can restore dismissed notifications, repeat
configured nags and loop alarm audio while the computer is awake and the app runs.
Android remains the platform with offline scheduled alarm guarantees.

Initial targets are KDE Plasma and GNOME with an AppIndicator extension, on X11
and Wayland. X11/XWayland is the default for closer Windows flyout parity and
requires an available X server. Explicit `--ozone-platform=wayland` uses native
Wayland, which controls window placement through its compositor.
X11 opens in the work-area corner nearest the tray, using the panel edge when the
tray integration does not provide icon geometry. Native Wayland taskbar treatment
also depends on the compositor. GNOME AppIndicator can require double click to
activate; this accepted exception does not install an extra extension. Tray services and notification
layout remain desktop-dependent. See [architecture](../../docs/linux-desktop-architecture.md).

## Development

Initialize the promo submodule and root dependencies using the normal project
workflow. Build tools for this package need Node 22.12 or newer. Keep the existing
web/API development environment on Node 20.
Root validation uses small transport test dependencies and stays on Node 20.
Install this standalone package separately for native tooling and packaging.

```sh
npm run build --workspace @persistent/shared
npm --prefix apps/linux-desktop ci
npm run dev:linux
npm run dev:linux -- --ozone-platform=x11
npm run dev:linux -- --ozone-platform=wayland
```

The package is outside the root npm workspace graph, like the Android wrapper.
The hosted web bundle must include the Linux bridge and notification Snooze listener
before using the Linux host against that server. Develop against this worktree's
web app by changing the server in the native Settings window's Connection page. HTTPS is required for
remote servers; HTTP is permitted only for localhost development origins.

## Build, package and install

```sh
npm run validate
npm run build:linux
npm run package:linux -- --x64
npm run package:linux -- --arm64
npm run install:linux -- apps/linux-desktop/artifacts/Persistent-Linux-0.1.0-x86_64.AppImage
```

Packaging emits AppImage and Debian packages into
`apps/linux-desktop/artifacts`. Package on the matching Linux architecture. An
isolated Node 22.22.3 Bookworm container can build Linux artifacts using existing
checkout dependencies; the real graphical app needs its desktop's user session.

The user installer checks the AppImage CPU, copies it into
`$XDG_DATA_HOME/persistent-linux` (normally `~/.local/share/persistent-linux`), and
adds an application-menu launcher. It does not launch automatically, clear sign-in,
change autostart, or replace a Windows installation. Quit and relaunch to use an
updated image. Moving an AppImage directly can invalidate its autostart path;
install it before enabling Start at sign-in.

On Debian/Ubuntu, the `.deb` can instead be installed with the system package
manager. Portable tar downloads are deliberately not published.
An AppImage needs working FUSE support, or its standard extract-and-run mode.
Keep the Chromium sandbox enabled. A distro that restricts unprivileged user
namespaces needs a supported package/sandbox configuration, not `--no-sandbox`.

The AppImage also has a packaged user installer, with no Node toolchain required:
quit any running instance, mark the download executable, then run it with
`--install`. It copies the app to the user-level location above, registers its menu
launcher and restarts the installed copy. Running it without that flag still works.

Updates are checked after startup and every six hours while the app runs. About
also offers Check for updates, Download update and Install and restart. Both
background discovery and manual actions ask separately before downloading and
before installation. Declining either keeps the current app running. Automatic
checking can be disabled. Nothing installs on quit without approval.

AppImage replacement preserves its existing path atomically. Debian updates check
package name/version/CPU, then request administrator approval through polkit and
use apt without allowing removals. The updater uses only stable `linux-v*` releases
from the official repository, schema-valid metadata, exact size and SHA-512 checks,
and restricted anonymous HTTPS redirects. These are integrity checks, not Linux
code signing. Unpackaged development builds do not install updates.

`linux-vX.Y.Z` tags run `release-linux.yml`, build both CPUs, and publish only after
all four packages and their checksum manifest exist. The package version must match
the tag, and its commit must be on main. Linux releases never replace Android as
GitHub Latest. An existing-tag manual run can recover a pre-publication workflow
failure without moving its tag. These developer build/install commands do not themselves publish.

## Runtime checks

Use a real logged-in session, a temporary keep-awake inhibitor, and isolated
`XDG_CONFIG_HOME` and `XDG_DATA_HOME`. Set the test profile's server to a disposable
synthetic API/web environment. Do not use personal reminders for notification tests.

Check startup, single-instance reactivation, warm reopen/draft preservation,
light dismiss and pin, Back hierarchy, toolbar Reload, resize and theme, native
tray activation, missing tray fallback, and tray-service recovery. Check off-by-default
notifications, native Done/Not yet/Confirm, full web Snooze, De-escalate, cross-device
clearing, dismissal restoration, configured nags, looping audio, reconnect/resume,
logout, account switching and rejected actions. Check connection recovery and
complete local sign-in clearing. Inspect packages and test the installed launcher.

Separate build evidence, notification-protocol evidence, renderer/audio evidence
and actual visible desktop evidence. Native GNOME Wayland does not establish KDE
or X11 coverage. A virtual WebAuthn authenticator does not establish real hardware
passkeys or Linux biometric support.
