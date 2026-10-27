# Linux desktop guidance

Read `docs/linux-desktop-architecture.md` and the notification, alarm, and auth
contracts before changing this host. The shared server projection is authoritative.
Never expand reminder schedules here or add browser/PWA notifications.

- The hosted page owns reminder management and Snooze. The host owns the reusable
  flyout, local icon toolbar, tray, background notification presentation and audio.
- Preserve two-step Done and server-approved De-escalate. Keep each occurrence
  independent. Failed reads retain live obligations; 401 and logout clear them.
- IPC must check the exact sender, main frame and expected origin or packaged URL.
  Never expose cookies, Node or a generic IPC bridge to web content.
- Credentials stay in the Chromium profile. Only an in-memory hash distinguishes
  session replacement from sliding expiry. Never log credentials or reminder text.
- The notification daemon cannot read ASAR paths. Its icon is an extra resource.
- Linux tooling and the web/API use the patched Node runtime pinned in their manifests.
  This standalone npm package deliberately follows the mobile package convention.
- Run `npm run validate`, `npm run build:linux` and the relevant package targets.
  Native runtime checks require a real desktop. Record compositor/backend, tray and
  notification capabilities, package identity, and what was actually observed.
- Test with synthetic data and isolated XDG profile/data paths. Never disable the
  Chromium sandbox or change desktop lock/DND settings to make a smoke test pass.
