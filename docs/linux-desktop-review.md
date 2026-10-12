# Linux release adversarial review

Reviewed the Linux host and hosted bridge before the first Linux release, including
untrusted renderer IPC, navigation, profile/account cleanup, notification lifetimes,
update discovery/download/install, package identity, and release workflow ordering.

## Findings addressed

- Notification-daemon restarts may reuse numeric IDs. Application handles now retain
  the exact D-Bus owner and never reset their sequence. Delayed results and old
  actions cannot close or operate a new daemon's notification. Regression tests
  simulate both owners returning the same ID.
- Script redirects and popup requests could launch an external browser. Only a
  trusted link activation can request that action; unknown navigation is blocked.
  Main-frame identity and exact origin are checked independently at IPC receipt.
  Authentication popups receive a minimal preload without the management bridge.
- Async notification registration could overwrite a concurrent native preference
  change. Settings now rebase onto current state after the awaited operation.
- Nonfinite or negative projection numbers could silently suppress an obligation.
  Malformed snapshots now fail as a whole, retaining current presentation.
- Updater cancellation could leak an open staging file. Reader cleanup always closes
  the file; installation is reverified and atomic for AppImage. Relaunch retains
  explicit arguments, and quitting prevents a delayed installer from reopening.
- Root validation previously depended on installing the separate Linux toolchain.
  Small pinned transport test dependencies restore the standard Node 20 workflow;
  native packaging remains isolated on Node 22.
- Server Docker context included native packaging output. The native subtree is
  excluded from the production image context.

No unresolved high or medium source findings remain from this review. Native
compatibility gaps remain in the separate verification record, including KDE,
independent X11, real hardware passkeys/Google, and privileged Debian installation.
Integrity hashes are not a Linux code-signing claim.

Release preflight also caught a GitHub repository relocation. Linux URLs now use
the verified canonical repository, shared by discovery, transport and downloads.
The updater deliberately rejects the former owner instead of broadening trust.

## Mandatory reviews

Documentation reviewed: root README and AGENTS, every tracked scoped AGENTS plus
Linux guidance, reminder-model guide, mobile README, all auth/data/alarm/notification/
desktop contracts, development docs, skill workflows, environment example, Docker/
Compose/build descriptors, CI workflows, package scripts and changed module comments.
Updated root guidance, desktop-related contracts, development/release guidance and
Linux architecture/install/verification docs. Android build/signing, reminder model,
API/shared/web scoped guidance, environment keys and production Compose behavior
needed no change. Windows native implementation and release workflow are preserved.

Data isolation: no domain queries, ownership rules or server routes changed. Linux
requests use the authenticated Chromium profile and existing server ownership checks.
Account replacement/logout fence late work and clear departed notifications. IPC and
update metadata validate bounded inputs; update requests are anonymous and cannot
carry hosted credentials. Shared schemas own the new host and Linux update contracts.

Logging: native failures use bounded, token-free local diagnostics; logs omit reminder
text, credentials and server bodies. API operational logging did not change. Missing
tray discovery, timed-out late-call rejection handling and departed D-Bus owner cleanup
are intentional benign fallbacks. Download/install errors remain visible in About.

Validation: repository validation passes 473 tests, with one existing skipped test;
separate native compile, hosted production build, x64/ARM64 AppImage and Debian
packaging, schema/checksum manifest generation, workflow lint and runtime dependency
audit pass. Native update approval/refusal and real AppImage replacement/restart were
exercised with an isolated profile and no audible alarms. See
[verification](linux-desktop-verification.md) for evidence and runtime limits.

Release CI built both CPU packages successfully but initially refused publisher
root dependency installation under Node 22 (`EBADENGINE`, root requires Node 20.20.2
and npm 10.8.2). The publisher now installs root dependencies under Node 20 before
switching to native Node 22. A manual existing-tag retry checks out the exact tag,
validates its version/main ancestry and uses the same publication sequence. The
failed tag is preserved rather than moved.
