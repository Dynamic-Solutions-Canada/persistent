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
