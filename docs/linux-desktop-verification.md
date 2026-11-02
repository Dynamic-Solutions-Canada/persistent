# Linux desktop verification

This is the development evidence for the Linux release candidate, checked on
October 12, 2026. It is not release certification or universal Linux compatibility.

## Automated and package checks

| Area | Evidence |
| --- | --- |
| Repository validation | `npm run validate`: 474 tests, 473 passed, one skipped; lint, shared/API/web typechecks and Prisma schema validation passed. |
| Focused behavior | Tests cover projection precedence, dismissal and nag timing, completion confirmation, rejected writes, logout and late publication cleanup, session refresh/account changes, disabled-to-enabled races, WebSocket generations, window geometry, settings/autostart, installer CPU checks, page readiness, X11 taskbar transport cleanup, daemon-generation isolation, trusted navigation, updater consent/cancellation, metadata and download integrity. |
| Web Snooze | Integration test uses the existing full picker, including Custom and Until; readiness gates the target occurrence and preserves an unrelated input/draft. |
| Native build | Separate Linux TypeScript check and bundled build passed using isolated Node 22 tooling. Hosted web production build passed using the existing Node 20 environment. |
| Packages | Final x64 packages built on home; final ARM64 packages built in the isolated ARM64 Node container. Both produced AppImage and Debian artifacts. ARM64 native execution and Debian system installation were not tested. |
| Installer | Final x64 AppImage installed with the real user installer and launched using standard extract-and-run mode from a temporary XDG data directory. Hosted UI, authenticated recovery, retained theme and all local images worked. Existing profiles and installed apps were untouched. The final packaged `--install` flag also copied the exact image, restarted its installed copy with debug launch arguments retained, and preserved the profile sentinel and Light theme. Wrong-CPU rejection and replacement safety have focused tests. |
| CI and dependencies | Linux check and release workflows passed static actionlint review; release CI evidence is tracked separately. Runtime dependency audit reported zero vulnerabilities at the time of the check. |

## Native runtime evidence

Testing used home's x64 Zorin/GNOME Wayland session, a temporary GNOME idle
inhibitor, an isolated profile/install directory, and a disposable database/API
with a synthetic account. Chromium sandboxing stayed enabled. No production or
personal reminders were used.

| Area | Observation and limit |
| --- | --- |
| Hosted UI and toolbar | Real hosted UI and compact icon toolbar; Back navigated Settings to Current, and Back from an unsaved editor opened the existing discard confirmation. The requested full GNOME desktop screenshot showed the top test notification, native Connection window and flyout together. Later Settings renderer captures confirm the image and publisher-card fixes. |
| Warm reopen | Closing and reactivating the resident app retained the same input node and unsaved draft. |
| Tray | The GNOME watcher registered Persistent. Its actual D-Bus menu had Open Persistent, Open in browser, separator, Reload, Settings, separator, Exit, matching Windows. Home's AppIndicator requires double click for activation; Ryan accepted that desktop exception. The full desktop capture shows the tray icon and bottom-right flyout. |
| Native notifications | Visible GNOME actions were exercised with native focused keyboard input: Done, Not yet, Confirm done, Snooze and De-escalate. Not yet retained the obligation; Confirm removed it from the real server projection. Snooze opened the existing picker over an unsaved editor, preserved the same draft/input node, and moved the occurrence to the future. Server-driven escalation offered De-escalate; the accepted action retained the soft obligation and stopped audio. Closing the visible notification removed it immediately; the resident host later restored it. |
| Server invalidation | The real authenticated WebSocket connected; recovery fetched server-computed active occurrences. Completing a synthetic alarm through the real API stopped resident audio. |
| Alarm audio | The independent local audio renderer was playing, looping and unmuted while the hosted view was hidden. A same-token session expiry refresh did not interrupt it. Completion paused playback and reset its position. Ryan heard the test alarm; controlled speaker/audio quality was not independently measured. |
| Logout | On an installed candidate, the real web Sign out action returned the UI to sign-in, `/api/auth/me` returned `user: null`, and the native daemon received CloseNotification for the owned reminder. |
| Account change | Switching to a second synthetic account through the real auth API and reloading exercised online account cleanup. Native realtime and zero-obligation recovery resumed without restarting the host. No new audible alarm was created. |
| Windows parity | Final default XWayland flyout was 420 by 680 DIP (saved profile size), at the bottom-right work-area corner with a 12-DIP inset. The real native capture showed the rounded thin frame. Final EWMH states excluded both mapped windows from taskbar/pager while retaining normal resize and maximize capability. Settings maximized to the work area, retained exclusion hints, restored, and hid on Minimize; tray Settings reopened it. |
| Native Settings | Connection, publisher catalog, About and Settings navigation worked. The actual theme control retained Light across close/reopen and installed-package launch. All six local images had nonzero native width. PrintStream's actions appeared below the wide description in the real renderer capture. About exposes automatic checking and manual Check, Download, and Install controls. |
| Updates | A disposable 0.0.9 AppImage discovered the 0.1.0 payload through a localhost release fixture. Real native Download Later left the payload unfetched; manual Download approved the exact real AppImage; Install Later retained 0.0.9 and ready status. Manual Install approved atomic replacement and actual restart at 0.1.0. Installed bytes matched SHA-512; the profile sentinel and Light preference survived. Fixture requests carried no hosted cookies. No audible alarm ran. This establishes the AppImage path, not Debian administrator installation or a live GitHub new-version update. |
| Window backends | Earlier candidates launched explicitly with native Wayland and X11. The final installed candidate used the approved default X11 policy under GNOME Wayland/XWayland. This is not an independent X11 desktop or KDE test. |

Visible checks ran after Ryan unlocked home with a temporary GNOME inhibitor.
A screenshot portal requested a broad persistent permission; the test declined it
and used GNOME's native screenshot shortcut for the requested capture.
The remote graphical session did not provide usable GPU device access, so these
observations do not establish hardware-accelerated rendering.
All synthetic active alarms were acknowledged, and the owned audio renderer was
confirmed paused, muted and reset after Ryan requested quiet. Test services and
temporary native processes were stopped after verification.

## Remaining acceptance checks

- KDE Plasma and an independent X11 desktop, including scaling, multiple monitors,
  tray activation geometry, resizing, light dismissal and theme changes.
- Do Not Disturb, notification-daemon restart, and a controlled physical speaker
  audibility check. Native playback/stop state was observed directly.
- Real hardware passkeys and Google sign-in, recovery-page
  clear-sign-in and installed Debian package execution. Live autostart-file state
  and account switching were exercised; a real desktop-login autostart cycle was not.
- Sleeping, suspended or disconnected-machine behavior, including catch-up after
  wake. Linux does not claim Android's offline scheduled alarm guarantees.

Ryan approved X11/XWayland as the default for closer Windows flyout parity.
It requires an available X server, uses tray geometry or activation coordinates
and panel/cursor fallback, and clamps the window to the work area. Explicit
`--ozone-platform=wayland` retains native Wayland with compositor-controlled
placement and taskbar policy. The final default has actual native runtime evidence;
explicit native Wayland does not carry the same placement/taskbar parity claim.

The updated hosted web bridge must ship before distributing the Linux host.
Windows native sources, package identity and release workflow are unchanged.

## KDE follow-up (2026-11-01)

The sign-in error screenshot identified an uncaught `write EPIPE` from
`HostedWindow.log` calling `console.error` after the launcher's stderr closed.
Host diagnostics now write only the bounded private log file, including when the
log write fails. A subprocess regression test closes both output descriptors and
checks successful logging, omission of error details, rotation and failure tolerance.
Normal light dismissal is unchanged, as Ryan requested.

An initial attempt to force X11 from the main script changed the reported switch
without reliably changing Electron's already-selected native backend. That made
host positioning/taskbar assumptions disagree with the actual window system.
Ryan requested Wayland; the forced switch was removed. Electron now selects its
native backend, with explicit `--ozone-platform` still honored. Native Wayland
placement belongs to KWin; tray-adjacent positioning is not claimed.

Final visible acceptance used a separate `persistent-private-kde` Docker container
based on Little Launcher's existing Fedora KDE test image. It had its own virtual
1280-by-800 KWin 6.7.5 compositor, Plasma, D-Bus, home and profiles, with access only
to the GPU render node. It did not mount the host display, session bus or home.
The packaged Electron 44.7.0 app started with the normal Chromium sandbox and
native Wayland policy. Private compositor screenshots showed the actual hosted
sign-in page. Injected clicks on Close hid the window, and a click on the actual
tray icon reopened the rendered sign-in page. The Tall window exceeded this small
test output's height; this check does not establish geometry at every display size.
No account sign-in, real email code, Google authentication, notification/audio or
multi-monitor acceptance was performed. Earlier main-window renderer captures
omitted WebContentsView pixels, so they were not used as final visible evidence.

The final x64 AppImage was built locally for atomic replacement at Gear Lever's
existing `/home/rewen/AppImages/persistent.appimage` path. Its launcher, icon,
path-keyed Gear Lever registration and account profile are preserved. Nothing was
published. Required validation and the standalone Linux build passed.

## Standard sign-in window follow-up

Before authentication, Linux now uses a separate standard framed window with the
desktop's own title bar and controls. It has no flyout chrome or light dismissal.
A native Settings menu opens Connection/About and offers Reload. Authentication
moves the same WebContentsView into the separately sized flyout; sign-out and
reload move it back. Sign-in window resizing does not change flyout dimensions.

The final package was exercised in the private Fedora/KWin 6.7.5 Wayland container.
Compositor screenshots verified the native caption/menu, signed-out focus retention,
transition into a 500-by-650 flyout, return on synthetic sign-out and native Settings
access. Earlier checks also verified normal minimize/maximize/taskbar restoration.
Screenshots are retained under `.artifacts/linux-desktop/signin-window/`. Test
credentials were synthetic page messages, not a real account login. The task-owned
container was stopped after testing. The final AppImage replaced Gear Lever's
existing file atomically, with byte verification and its launcher/registration/profile
preserved. Repository validation and standalone Linux build passed.

Windows changes compiled with full XAML in Debug and Release in the dedicated
`windows-dev` VM. After Ryan signed in over RDP, the shared installer installed
signed x64 dev MSIX 0.6.1.3. Actual UI assertions and VM screenshots verified the
standard caption/minimize/maximize controls, no signed-out topmost/light dismissal,
native Settings access, the borderless topmost signed-in flyout and its light
dismissal, sign-out restoring the standard frame, and one hosted page load with a
retained synthetic draft across transitions. This used a localhost synthetic page,
not real Google/email authentication. A foreground-verified click test exposed a
presenter-transition edge: Windows can omit a second Deactivated event when focus
has already left. The existing dismiss timer now rechecks once after that change.
The final full UI sequence passed.

Build/package/resource reports and native screenshots are retained under
`.artifacts/windows-build/vm-signin-final-20261101/`. Tracked versions did not change.
The temporary private signing copy and VM-only NuGet proxy/firewall rule were
removed. The temporary dev package and test profiles are removed after verification;
Ryan's RDP session and unrelated applications remain intact. Windows must receive
the updated hosted `signedIn` bridge before its host can enter flyout mode; older
hosted bundles leave it in regular window mode. Nothing was published.

## Logout rendering and KDE placement correction

Ryan's subsequent blank sign-in report exposed a gap in the earlier synthetic
transition check: it observed existing pixels after moving the view, but did not
prove that asynchronous page updates could repaint. The renderer remained alive
with valid bounds while `document.visibilityState` stayed `hidden`. The host now
disables background throttling only while the current shell is visible and not
minimized, restoring normal throttling while hidden/minimized.

In the private Fedora/KWin 6.7.5 native Wayland compositor, a regression harness
verified three sign-in/sign-out cycles, asynchronous DOM repaint, the same hosted
WebContents ID, hide/show and minimize/restore visibility. The final packaged app
also completed three cycles through its real trusted preload/IPC bridge, retaining
a synthetic draft and reporting visible page state throughout. Private input
clicked Continue, unpinned the flyout, dismissed it by clicking the desktop, reopened
it using the actual tray icon, and clicked Sign out again. Compositor screenshots
showed rendered content and the separate standard sign-in frame.
Graceful exit unloaded the process's KWin script (confirmed through D-Bus).

The KDE-only helper was measured by a fixture-only KWin observer. Its 500-by-650
flyout moved from compositor-centered `(390,52)` to tray-corner `(768,92)` on the
1280-by-800 output, with the intended work-area inset. The sign-in shell retained
normal compositor geometry. The generated script uses KWin-compatible syntax;
object spread was rejected by QJSEngine during development. Unit checks cover
PID/title ownership, scaled native-pixel anchors, negative origins, and explicit
center/saved placement. Actual multi-output and scaled-output acceptance, real
email/Google authentication, notifications and audio were not exercised here.

Evidence and the synthetic fixtures are retained under
`.artifacts/linux-desktop/logout-placement-followup/`. Final root validation passed
(607 tests: 605 passed, two skipped), as did the standalone Linux build and x64
AppImage packaging. The Gear Lever replacement uses its existing registered path;
launcher and registration hashes are checked unchanged and the old image is backed
up before replacement. No account profile is modified by installation.
The installed image's SHA-256 is
`c383b0b59270821705aeb360c50271cd638b4b5dd5309c534cb102424240b758`.

## Intermittent placement and navigation height follow-up

Ryan reported that the previous package still often opened centered. Thirty
regular-sized and twenty Tall-window openings finished in the expected corner
in private KWin 6.7.5 testing; that fixture did not reproduce the natural failure
on his KWin 6.8.2 desktop. Inspection identified an uncovered ordering: the
script handled mapping/caption changes, but not a later centered geometry commit.
The script now reconciles frame-geometry changes idempotently, guards reentrancy,
and stops correcting after an interactive move/resize starts.

A deterministic native stress test deliberately centered the mapped flyout after
each initial placement. All twenty openings recovered the requested corner.
The final packaged app was also dragged with private compositor input: it stayed
at the manually chosen position, then returned to the tray corner after closing
and reopening through the actual tray icon. This is evidence for the late-commit
ordering, not a claim of naturally reproducing every host-specific failure.

BottomNav also reserved two label lines even for short English labels. Removing
that minimum and aligning columns at the top reduced the actual rendered bar at
420 CSS pixels wide from 67.8 to 53.4 CSS pixels tall. At 320 pixels, German labels
wrap to two lines, grow the row naturally, and keep icons aligned. These checks
rendered the actual Joy UI component with synthetic query caches and canonical
translations in isolated Chromium. The hosted navigation change requires a web
deployment; an AppImage replacement alone does not deliver it.

Final root validation passed (608 tests: 606 passed, two skipped), as did standalone
Linux compilation, x64 AppImage packaging and the production web build. Native
evidence is under `.artifacts/linux-desktop/placement-repeat/`; navigation render
measurements and images are under `.artifacts/web/nav-height/`.
The revised AppImage replaced Gear Lever's existing registered file atomically;
its launcher and registration hashes stayed unchanged. The installed SHA-256 is
`37ada3f82b06d06971d011c7ea820a6da3b53cfe49b60d67220ef8edbe694867`.

## AppImage-only distribution

The current distribution policy is AppImage only, for x64 and ARM64. Earlier
Debian package/build entries above are historical. Package scripts and CI upload
only AppImages, and the publisher requires both CPU images before writing the
checksum manifest. The updater has no privileged installer or package-database
query. Strict current metadata rejects Debian artifacts; release discovery ignores
legacy Debian rows so older AppImage release manifests remain readable.

Regression checks cover missing CPU images, exact payload checksums, obsolete
package files being excluded, current/legacy manifest discovery, and refusal to
install without an AppImage destination. Navigation's hosted deployment is separate
from local AppImage replacement.
Root validation passed (609 tests: 607 passed, two skipped), standalone Linux
compilation passed, and `npm run package:linux -- --x64` built an AppImage only.
The ARM64 publisher path is covered by the checksum-manifest regression; a fresh
ARM64 native execution was not performed for this packaging-policy change.
