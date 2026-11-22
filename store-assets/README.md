# Store screenshot refresh

The carousel manifest is `manifest.json`. Play exports use real app captures in reusable phone frames, with a saved studio backdrop. Microsoft exports use the actual Windows tray flyout, including its native chrome. Capture commands do not publish a listing. The separate Store workflows publish only when requested.

[Open the image preview](review.png). The gallery Markdown files use relative image links; if a viewer does not render them, open the PNG files directly.

[Review all Play images](play/README.md) and [all Microsoft images](microsoft/README.md).

## Prepare the demo

Use the existing Devkit development stack. From its Node container, in `/workspace`:

```sh
npm run shots:prepare -- --email=demo@example.test
```

The command accepts only that account and local development database hosts. It resets the demo reminders, preserves its sign-in methods, and creates a protected synthetic `alex@example.test` recipient with one completed assigned task. `fixture.json` records the generated reminder ids. Seed once per refresh, then keep those ids for the whole capture session. Dates are relative to preparation, with schedule-consistent passed firings, including Friday rather than Saturday for weekday reminders.

Sign in to that account on the local development origin. The development email-code response includes a preview code; use the ordinary verification endpoint without printing the code or session token. Never use production or a personal account. Set Enjoy Light or Enjoy Dark, 12-hour times, Toronto timezone, and doodles off. Dismiss announcements and the native-app promotion. For phone captures only, hide the web-only “Get the app” button, which is absent in Android, following the previous listing capture convention. Keep actual app content unchanged.

## Google Play

The [Firebase Test Lab workflow](../docs/test-lab-store-captures.md) provides a
separate capture path on disposable devices, with a synthetic-only temporary
server and a free-only submission guard. Check its runtime verification status
before using its results as store sources.

Use the isolated demo Android app on the physical phone, following the native
capture setup below. Capture the full display for all eight images, including the
real status area and gesture bar. Both bars must be readable against the selected
theme, and unrelated notification icons must be absent. Do not add simulated
system chrome or hide another app's notifications without permission. Capture
these six app scenarios; the manifest determines final carousel order:

1. Current, Enjoy Light. The plants, puppy, and part-completed morning checklist are visible.
2. Open “Get out the door” in its reading dialog, Enjoy Dark. Do not toggle items or Done.
3. Edit “Take vitamin D”, Enjoy Light, showing the synthetic medicine name and 1000 IU dose. Do not save.
4. Create a draft reminder and open Share, Enjoy Dark. Stage `alex@example.test` in the dialog without saving or sending an invitation. Use ordinary input or the existing debug WebView endpoint for controlled fields and verify their state.
5. Notes, Enjoy Light, showing “Trip packing”.
6. Assigned by me, Enjoy Dark, showing the completed synthetic parcel pickup.

The final carousel also includes the real notification shade and alarm described
below, immediately after Current, for eight images total. Eight is the Play
carousel limit. Keep marketing copy focused on the feature; do not put theme
names in the exported images. The notification image leads with the defining
behavior: swiping a reminder away does not complete it, and it returns until the
user explicitly confirms completion.

Save each full native capture to the `source` path in the manifest after the RGB conversion below. For Paseo composition exports, the helper accepts base64 on stdin: `node --import tsx scripts/dev/store-assets.ts save store-assets/raw/android/...png`. It never logs image data. Keep raw captures alongside the final exports so future caption/frame edits do not require recapturing the UI.

Run `npm run shots:render`. Navigate the Paseo tab to each generated HTML layout through Vite, for example `http://localhost:<web-port>/@fs/workspace/store-assets/render/00-current-light.html`. Set **720 x 1280 CSS pixels**, wait for the captured image to load, then screenshot. On the current Windows Paseo host, DPR 1.5 produces **1080 x 1920**. Check actual dimensions, rather than assuming the host's DPR. If another host differs, adjust the CSS viewport and renderer canvas together to produce the same export dimensions.

The mockups use a small alternating angle and reusable CSS phone frame. The app pixels come exclusively from the raw screenshots. The saved background and generation prompt are in `marketing/`; reuse them for consistency. Google recommends avoiding device imagery and skew, but this carousel deliberately includes those stylized mockups at the maintainer's request.

After inspection, run `npm run shots:check`, which validates every export. The curated Play files are the PNGs in `play/`, the only copy: the publisher uploads them from there and the README embeds them. Preserve native permission demonstration videos, which serve a separate purpose.

### Real Android capture setup and native scenarios

Use an explicitly authorized physical-device session and the `test-android-device`
skill. Read the shared home-devices guide before connecting to `phone.home`;
wireless debugging ports rotate. Keep the phone unlocked with the shared helper's
temporary input keepalive, never by changing display or lock settings.

Keep the Store app and its personal account intact. Use the separate direct-debug
package, `ca.persistent.app`, with the protected demo account. In the existing Node
development container, build with `PERSISTENT_ANDROID_DEV_URL=http://localhost:5173
npm run build:android`, then install only the direct-debug APK. Forward the device's
port 5173 to the local web port with `adb -s <serial> reverse tcp:5173 tcp:<web-port>`.
Confirm the synthetic account in the app before proceeding. Enable notifications
and display-over-other-apps only for this demo package through the ordinary Android
permission screens. Both packages are named Persistent, so verify `ca.persistent.app`
and the demo version on App Info before changing a Settings toggle.

For the shade, expand the real Persistent notification group and the plant
reminder until Done and Snooze are visible. Do not press either. Inspect for
personal notifications and network names before saving an asset. Any crop or
retouch needs an explicit framing decision; do not clear personal notifications
or change network settings to clean up the shot.

For the escalation alarm, select Enjoy Dark and let its native appearance synchronize. Create
one temporary synthetic reminder named "Check the oven", with body "Take the tray
out, then turn the oven off.", When set to Now, persistence set to Persistent,
and escalation set to one minute. Use the ordinary app/API flow and leave the
reminder unconfirmed until it actually escalates. Capture after the native launch
animation settles, with Done, Snooze, and De-escalate visible. Verify there are no
other app notification icons in the status bar. Then force-stop only the demo package
to stop the sound promptly. Delete only the newly created reminder from the
verified local demo account. Never press Done for a screenshot.

Capture the actual screen with `adb -s <serial> exec-out screencap -p > <path>.png`.
The Pixel 9 Pro source is 960 x 2142. Android captures are RGBA; run
`scripts/dev/convert-store-capture.ps1` with `-InputPath` and `-OutputPath` to save
the same dimensions and pixels as Store-compatible RGB. It uses the existing
Windows image runtime. If RemoteSigned rejects a WSL UNC script, execute a
reviewed copy from an owned Windows TEMP path, then remove that copy. Do not
change execution policy or install an image tool.

Use the saved native PNG in the manifest and render it through Paseo in the same
phone composition as the app screens. After capturing, force-stop the demo app,
remove this session's ADB reverse/forward mappings and on-device inspection files,
and stop its owned keepalive. Leave the Store app, personal data, pairing keys,
and original display timeout unchanged.

Inspect immediately before each capture: live Android notifications can arrive
while waiting. Keep only Persistent's notification icon and the ordinary Android
status indicators in exported native screenshots. Obtain approval for any retouch
or unrelated notification dismissal; an already clean real capture is preferable.

## Microsoft Store

The four Microsoft screenshots are the real tray flyout on the Windows 11 test VM (`windows-dev`), never on a personal desktop. `raw/microsoft/` holds each whole-desktop capture at 1:1 with the `.json` sidecar the capture helper writes; `microsoft/screenshots/` holds the listing images rendered from them. The manifest's `microsoft` entries follow winui-app-kit's schema (its `scripts/store/render-screenshots.py` header has the rules): each names its output under `microsoft/`, its `source`, `theme: "dark"`, `crop: "tray"`, the en-US caption and the alt text.

1. **Capture** with the windows-build-tools app-test helpers, in a throwaway session: an uncommitted compose override adds `-snapshot` (check it is in QEMU's command line before Windows boots) and the VirtIO display at 1920 x 1080, at 100% scaling. Connect the VM to the dev stack's network, forward the guest's `localhost:5173` to the web container, install the Debug dev package, and point the packaged app at the local origin: an MSIX app reads its settings from `%LOCALAPPDATA%\Packages\Persistent.Desktop_<publisher id>\LocalCache\Roaming\Persistent\settings.json`, not the real `%APPDATA%`, so check the origin before signing in. Sign in to the demo account only, through the WebView2 debug port (in the throwaway guest, the `HKLM` WebView2 `AdditionalBrowserArguments` policy for `Persistent.Desktop.exe` is the only route that enables it). Run `screenshot-desktop.ps1 -Mode Prepare` (dark theme, the `img19.jpg` wallpaper), dismiss announcements and the native-app promotion, open the default unpinned flyout from the tray, and save each view with `Save-DesktopCapture`: Current, the checklist reading dialog, the vitamin reminder editor (dose and Save visible; never saved) and Assigned by me, all in Enjoy Dark. Copy each `.png` and `.json` into `raw/microsoft/` under the manifest's names, run `app_test_clean`, disconnect the VM from the dev network, then recreate it from the base compose and stop it so nothing persists.
2. **Render** with `npm run shots:render`, which also runs winui-app-kit's renderer: each capture is cropped to the manifest's `size` from the bottom-right of the screen, taskbar included, with nothing composited, shaved or scaled, and written without an alpha channel (ASSET-9). Recaptioning needs no recapture; a new look does. `npm run check:screenshots` (part of `validate`) checks the sidecars, the sizes, the dark theme and that the captions equal the en-US `screenshotCaptions` in `microsoft/listings.json`; `shots:check` checks that every listing locale has one caption per screenshot.

## Verify and review

Run `npm run shots:check` and `npm run validate`. Generate the contact sheet without a browser using Windows PowerShell 7: `scripts/dev/render-store-review.ps1 -AssetsRoot <absolute Windows path to store-assets>`. It reads the saved PNGs and writes `review.png`, without changing the store exports. The HTML renderer also writes `render/review.html` for interactive review. Both previews adapt to the manifest's Play image count. Inspect every final image, not just dimensions: no clipped dialogs, loading frames, missing labels, personal data, stale themes, or duplicate reminder cards. Keep Play text above the phone and concise. Record the tested source revision and capture date when refreshing; do not upload screenshots for a theme that has not shipped without coordinating the app update.

The Microsoft set was captured November 19, 2026, between 4:02 p.m. and 4:04 p.m. Toronto time, on `windows-dev` (Windows 11 10.0.26200) with the Debug dev package of desktop 0.6.1 showing the web app from the development working tree at `9d75add`, signed in only to the protected synthetic demo account. Play uses eight full-display captures. The native capture provenance is recorded in `raw/android/native/README.md`.

## Publishing an approved refresh

After deploying the matching hosted UI, run the existing `play-listing` workflow
in check mode and inspect its diff. The workflow publishes localized text by default. For an explicitly approved carousel refresh, run it with `images` enabled: it sets the en-US phone screenshots from the manifest's `play` files, in manifest order, and clears them in the other eight languages, inside the text edit. Screenshots are captured once, in English, and the other languages inherit them (fleet decision D-098). Run `check` first, which validates the files and reports the plan, then `publish`. The icon and feature graphic are not touched.
API success confirms a committed edit, not review submission. Open Publishing
overview in Play Console, inspect all pending changes, send the approved items
for review if needed, and confirm the phone screenshots appear under Changes
in review. Public availability remains a separate check after approval.
No Android version bump is needed for listing assets or hosted UI alone.

The `store-publish` workflow validates the Microsoft manifest and release notes,
uploads the new native package as a draft, attaches the four ordered screenshots,
using the same `.msixupload` filename registered by the CLI,
and commits the combined submission only in publish mode. It preserves other
listing fields, logos, languages, pricing, and package policy. The approved notes
are `release-notes/desktop-<version>[.<identity>].md`, sent to every listing locale. Draft mode leaves the complete package and
listing for review. A successful submission is still subject to Store processing
and certification; inspect its status before claiming the update is live.

Windows GitHub releases use the same en-US file, with the disclosure line added by CI. Write and approve a version's notes in every wording before tagging it; see `release-notes/README.md`.

Store requirements: [Google Play preview assets](https://support.google.com/googleplay/android-developer/answer/9866151) and [Microsoft screenshots](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/screenshots-and-images). Recheck them for future submissions.
