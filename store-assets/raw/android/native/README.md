# Native Android capture provenance

Captured on November 19, 2026, between 2:19 p.m. and 2:28 p.m. Toronto time, on the shared `android-vm` emulator (API 37 Google Play image, Pixel 7 profile, 1080 x 2400), not on a personal phone. The web app came from the development working tree at `b504c98` (Persistent 0.31.1, React 19, web-app-kit 0.2.0), loaded by the direct-debug package `ca.persistent.app` through `adb reverse` to the local Vite server. The app was installed fresh for the session and signed in only to the protected synthetic account `demo@example.test`, prepared with `npm run shots:prepare`.

All eight captures are Enjoy Dark, with 12-hour times and doodles off. Notifications, display over other apps and background running were granted through the ordinary Android screens.

- `00-current-dark.png`, `03-checklist-dark.png`, `04-medication-dark.png`, `05-sharing-dark.png`, `06-notes-dark.png` and `07-assigned-dark.png`: actual full-display app screens. The sharing recipient is staged in an unsaved draft, which was then discarded; the medication editor was not saved; no checklist item or Done was pressed.
- `01-notification-shade-dark.png`: the actual Android shade with four distinct demo reminders and the plant reminder's real Done and Snooze controls expanded. The Wi-Fi tile shows the emulator's generic network ("Demo SSID" under SystemUI demo mode). The emulator has no SIM, so a "Mobile data: Unavailable" tile is visible.
- `02-alarm-dark.png`: the actual native `AlarmActivity` for a temporary "Check the oven" reminder (body "Take the tray out, then turn the oven off."), created through the ordinary authenticated API with Persistent notifications and a one-minute escalation. It escalated for real. Because the emulator has no audio output, the service did not raise the alarm surface by itself, so it was opened by tapping the alarm notification, whose content intent is the same activity. Done, Snooze and De-escalate were not pressed. The reminder was then deleted and the app force-stopped.

Session changes on the emulator, each recorded first and restored before it was stopped:

| Change                                    | During capture                                                                                                 | Restored to                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Device time zone                          | America/Toronto                                                                                                | Etc/UTC                        |
| System night mode                         | On                                                                                                             | Off                            |
| SystemUI demo mode (`sysui_demo_allowed`) | On: clock set to the real time at each capture, full battery not charging, Wi-Fi at full signal, mobile hidden | Exited; `sysui_demo_allowed` 0 |
| `adb reverse tcp:5173`                    | To the local Vite server                                                                                       | Removed                        |
| `ca.persistent.app`                       | Installed                                                                                                      | Uninstalled                    |

Demo mode's "hide notification icons" setting has no effect on this Android version, so Persistent's own notification icon is visible beside the clock; no other app's icon is present. Two unrelated notifications were dismissed with approval before capturing: Android's "Set a screen lock" suggestion and another test app's pairing notice. The emulator was kept awake by a periodic wake key event, with no display or lock setting changed.

The captures were reencoded from opaque RGBA to 24-bit RGB without cropping, scaling or retouching. The Play compositions were rendered by `npm run shots:render` and captured in headless Chromium at 720 x 1280 CSS pixels and a device scale of 1.5, producing 1080 x 1920 exports.
