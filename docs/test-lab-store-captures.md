# Firebase Test Lab store captures

This is an experimental capture workflow for disposable Android devices. The
free-only setup is validated, but the complete screenshot path is not yet usable.
It does not use the personal phone, publish a listing, or change the Store app.
The existing Firebase project is `persistent-7c99a`. Ryan approved that project
and free allowance only.

Firebase Test Lab is deprecated and shuts down on September 30, 2027. Google's
replacement, Developer Device Platform, requires billing to be enabled. Keep this
requested free-only workflow for now; reassess it before that date and obtain a new
spending decision before any migration. See the [official deprecation FAQ](https://firebase.google.com/docs/test-lab/migrate-faq).

## Setup status and remaining gates

The free-only foundation is validated: project access, disabled billing, Testing
and Tool Results APIs, isolated APK compilation, ordinary synthetic sign-in,
native alarm permission readiness, full-display PNG export and detached demo
server ownership. The latest full validation passed 433 tests with one skipped
and no failures; the last Android app/test APK build passed too.

Virtual phones are the approved default, using the live-catalog `MediumPhone.arm`
API 36 (Android 16) model. Earlier API 35 runs below remain historical evidence.
Physical runs are historical evidence only. On October 11 at
12:35 a.m. Toronto, the console showed physical usage 5/5 and virtual usage 0/10.
The resumed investigation submitted six virtual runs, with no physical submissions
and verified disabled billing before each. A Toronto date change does not prove
Google's daily quota reset.

Two bounded native diagnostic runs passed. The second verified all four native
alarm permissions and battery exemption. UI Automator recognized the visible
shade titles that raw remote accessibility queries missed. The shell wrapper now
uses Android's supported stdin/stdout/stderr API rather than relying on quoted
arguments in `Runtime.exec(String)`. App capture readiness checks actual SystemUI
synthetic reminder titles, because an inactive generic heads-up resource remains
present even when no banner is visible.

The latest full virtual carousel exported seven original PNGs at 1080 by 2400
pixels. All seven were visually inspected: Current, expanded notification shade,
checklist, medication editor, staged sharing, Notes and assignment progress. Real
status and gesture chrome is retained, and the shade exposes Plant Done/Snooze
without completing or dismissing any reminder. None was adopted because unrelated
lab/system notification icons remain. The eighth scene, the native escalation
alarm, was not captured.

The escalation failure is independently evidenced: at 1:11:47 a.m. Toronto the
synthetic Oven firing logged `alarm=false debounced=false`; at 1:12:43 a.m. its
escalation logged `alarm=true debounced=true`. `AlarmService.startAlarm` updates
its notification then returns before the tone and alarm activity when the previous
base firing falls within the four-minute `SOUND_DEBOUNCE_MS`. The final video frame
shows the Oven marked Escalated in the app, confirming server scheduling worked.
Alarm debounce product code was not changed, and the one-minute fixture was not lengthened to
conceal this defect. Resolve the native transition before another full submission.

The earlier virtual PNGs showed the gesture bar overlapping bottom navigation labels.
The latest carousel's log explicitly records `WebViewFactory: Loading
com.google.android.webview version 124.0.6367.219 (code 636771932)`. The native
host draws edge to edge and its web navigation relies on CSS safe-area insets.
Android's [WebView inset compatibility documentation](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)
places system-bar CSS safe-area support at M136 for fullscreen WebViews and M144
for all WebViews. The M124 lab runtime therefore has a documented compatibility
gap, confirmed by the focused runtime measurement below. The native inset
fallback now supplies the missing CSS spacing. The
capture runner now requires two continuous seconds without actual Persistent
SystemUI banner content, checks again immediately before reading the compositor,
and samples three times afterward before saving. It discards an interrupted
candidate without clearing notifications. Every capture also writes measured
layout/inset JSON; app captures fail if header controls intersect the status bar
or navigation controls intersect the gesture/navigation inset. The updated guard
passed focused virtual matrix `matrix-3gmnp2qckhu23` in 20 seconds. Its original
Current PNG was visually inspected: clock/header and all five navigation labels
clear their bars, and no heads-up/banner/app-name overlay covers the app. The
layout JSON proves WebView 124.0.6367.219, CSS env top/bottom zero, native fallback
24 CSS pixels each, native status/navigation insets 63 physical pixels each, two
header controls and five navigation controls measured, and both clearance checks
true. Android 16/API 36 then passed focused matrix `matrix-q2pd7fif1tjga` in
15 seconds. Provenance explicitly records Android 16 and API 36; its WebView is
133.0.6943.137, with CSS insets still zero and the same working 24-pixel native
fallback. The original 1080 by 2400 PNG confirms readable clock/header, all five
nav labels above the gesture bar, and no transient banner/app-name overlay.
Review subsequently tightened the geometry conversion to the fractional visual
viewport and rejects invalid, zoomed or offset measurements. Scene requirements
are explicit rather than inferred from a filename. The earlier successful PNGs
remain original visual evidence; the revised guards are checked by disconnected
geometry tests and instrumentation compilation, not a new cloud run. Native alarm
window assertions remain a runtime gate until the escalation defect is resolved.
Both focused successes do not establish the complete carousel or remove unrelated
lab status icons. The latest owned server/tunnel, database volume, network and
supervisor were removed after artifact review; a second stop is a harmless no-op.

The live catalog also offers `MediumPhone.arm` API 36 and
`MediumPhone_ps16k.arm` APIs 36/37. It does not expose WebView versions, so selecting
a newer Android image does not establish a current WebView. Android 16 was
selected explicitly; no replacement WebView installation was substituted. The focused capture records
`WebView.getCurrentWebViewPackage()`, native
root `WindowInsets` (status/navigation bars, gestures and IME), actual WebView
bounds/padding, and CSS `env(safe-area-inset-bottom)` using a temporary invisible
measurement element. Compare these with visual viewport height/offset and bottom
navigation bounds, retaining original PNGs. Subsequent diagnostics also record
`devicePixelRatio`, visual viewport width/scale and the conversion used, exposing
rounding in integer `innerWidth`. No extra run was consumed for those added fields.
These metadata reads do not change
layout or replace pixel acceptance.

Unrelated notification providers are a separate fidelity gate. The read-only probe
confirmed the companion backdrop's notification permission is not system-fixed;
`android` and SystemUI permissions are fixed. Android 15's source marks its
physical-keyboard and developer channels blockable, so fixed package permission
alone does not establish unremovable channels. The security channel is not marked
blockable. No broader package suppression, lock configuration, retouch or hidden
system chrome was substituted. An explicit sanitation decision is needed before
modifying the lab companion or these specific system channels.

| Matrix | Result and evidence |
| --- | --- |
| `matrix-1gdd42qbhs4ua` | Historical physical run: first PNG rejected for battery/migration prompts and heads-up overlay. |
| `matrix-1dwfz0ehz67co` | Historical physical run: account announcement blocked readiness. |
| `matrix-1b3z46dkxrzud` | Historical physical run: raw accessibility missed visible shade text. |
| `matrix-2d3elolm709ak` | Historical physical run: Cloudflare 1033 after foreground supervisor exited early. |
| `matrix-1mrjnwgo6km74` | Historical physical run: shade accessibility wait failed; Current rejected for heads-up overlay. |
| `matrix-c9dmlwllv8iha` | Virtual diagnostic passed; exposed shell argument and raw accessibility failures. |
| `matrix-3ykhipbz8d64a` | Virtual diagnostic passed with corrected shell transport; native readiness and UI Automator verified. |
| `matrix-f1ctyucd9cyua` | Full virtual run exported three PNGs; medication guard expected a nonexistent Dose label. Corrected to actual Qty/Unit fields. |
| `matrix-28qsdlmq7cbeh` | Full virtual run exported seven PNGs; native alarm wait failed at action 55 due to sound debounce. |
| `matrix-3gmnp2qckhu23` | Focused Current capture passed in 20 seconds; original PNG and inset measurements confirm system-bar clearance and absent transient banner. |
| `matrix-q2pd7fif1tjga` | Android 16/API 36 focused Current capture passed in 15 seconds; original PNG and measurements show no inset/banner regression. |

Evidence is retained only under ignored `tmp/test-lab/results/`, including
`virtual-probe`, `virtual-probe-second`, `virtual-carousel` and
`virtual-carousel-second`, `virtual-inset` and `virtual-android16`. Each includes original video, instrumentation results,
logcat and exported PNG/provenance. The latest full matrix is available in the
[Firebase console](https://console.firebase.google.com/project/persistent-7c99a/testlab/histories/bh.40c069ad9371d236/matrices/5366276306017837539).
Published Store captures remain unchanged by the experimental tooling.
The exact temporary Oven reminder was deleted through ordinary authenticated API
before teardown. All owned demo containers, network, fresh database volume and
detached supervisor were verified absent; session metadata is gone and a second
stop succeeds without changing resources. The public tunnel is closed.

External prerequisites are Google Cloud sign-in with Test Lab and billing-read
permissions, and a current isolated HTTPS demo session. The active localhost stack
and ADB reverse connection cannot be reached from Test Lab. Do not point this
workflow at production or put session tokens in instrumentation arguments.
Ryan approved the temporary synthetic-only stack and tunnel described below.
The active development database also contains personal development accounts:
never tunnel that stack, because preview-code login would expose those accounts.
Use a fresh disposable Devkit/Compose checkout with only the demo and sample
recipient, no imported database baseline, no copied personal `.env`, external
email disabled and no production FCM credentials. Stop its tunnel after the run.

## Temporary isolated HTTPS demo

`scripts/dev/test-lab-demo.mjs` follows the repository's existing Docker runtime,
PostgreSQL 16.13 and static-web API conventions. It copies an allowlist of tracked
source files into ignored scratch space, creates a blank `.env` before startup,
mounts installed dependencies read-only and creates a fresh private database
volume. It does not invoke Devkit's inherited `.env` or baseline import paths.
The original development database is never attached to its network.

Choose a small unused private subnet after checking Docker, host and VPN routes.
The helper verifies Docker and Linux IPv4 overlaps; on WSL, inspect Windows routes
too. Do not prune other projects' networks to resolve exhausted default pools.

```sh
docker network inspect $(docker network ls -q) --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}'
ip -4 route
# In Windows PowerShell: (Get-NetRoute -AddressFamily IPv4).DestinationPrefix
node scripts/dev/test-lab-demo.mjs start --background --subnet=UNUSED_PRIVATE_CIDR
```

The setup migrates the fresh database, builds static web/API assets and seeds
exactly the demo and `alex@example.test` accounts. It refuses exposure until the
account list matches exactly. Fixture preparation asserts one live firing per
reminder and refuses duplicates before exposure. It never changes lifecycle
states or acknowledged history; if a seed produces duplicates, correct its
synthetic schedule/window generation first. Its temporary server permits sign-in only for those
two accounts, blocks invitations, completion and general edits, and permits only
the reviewed synthetic oven escalation, current announcement acknowledgement and
native bookkeeping. Request bodies use the normal shared schemas. The outer
reminder guard resolves the caller's session and re-fetches the exact temporary
fixture with both reminder id and authenticated user id before deletion. Image
credential defaults are explicitly blanked as well. No external email,
Google login or production FCM credentials are supplied. It serves compiled web
assets rather than Vite, so the tunnel does not expose the source filesystem.

The official `cloudflare/cloudflared:2026.10.0` container creates an accountless
HTTPS Quick Tunnel. The actual origin is applied to the demo process for auth,
CORS and WebSocket checks. No DNS records, Cloudflare account changes or host
installations are needed. [Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
describes its temporary URLs and limitations; the workflow uses WebSockets, not SSE.

The helper reuses Devkit 0.13's background runner without its environment-inheriting
preflight. It detaches the owned supervisor with a private log and an IPC readiness
handshake only after synthetic isolation, public JSON health and ordinary public
synthetic sign-in pass. The launcher can exit while the supervisor remains in its
own session. Its log is `tmp/test-lab/logs/demo-supervisor.log`. Check that lifetime
and readiness before a matrix. The reused internal module path must be verified
when changing the installed Devkit version.

The supervisor has a 90-minute expiry
deadline and bounded startup commands and removes its server, tunnel, network and database volume on expiry,
SIGHUP, SIGINT, SIGTERM or setup failure. Shutdown reasons and owned-server exit
code/signal and safe setup failure phases are logged. `tmp/test-lab/demo-session.json` records its
temporary URL, expiry and owned Compose identity. Cleanup verifies that labelled
containers, networks and volumes are absent before deleting this identity. A
successful Compose exit is insufficient when a volume is still in use; failed
verification retains metadata for an explicit retry. Stop promptly after capture:

```sh
node scripts/dev/test-lab-demo.mjs stop
```

Runtime setup verification established exactly two accounts before and after
public requests, HTTP health 200, non-fixture sign-in 403, normal demo sign-in,
nine demo definitions and an authenticated WebSocket connection. This proves the
demo transport, not Test Lab screenshots or native alarm behavior.

## Cloud CLI and free-only policy

Run from the repository root. The helper uses Google's official
`588.0.0-stable` Docker image, verified against Google's release metadata on
October 10, 2026. It leaves host software untouched. Credentials live only in
the ignored `.secrets/test-lab-gcloud` directory, with owner-only permissions.

```sh
scripts/dev/test-lab-cloud.sh version
scripts/dev/test-lab-cloud.sh auth login --no-launch-browser
scripts/dev/test-lab-cloud.sh billing projects describe persistent-7c99a
scripts/dev/test-lab-cloud.sh services enable testing.googleapis.com toolresults.googleapis.com --project=persistent-7c99a
scripts/dev/test-lab-cloud.sh firebase test android models list --project=persistent-7c99a
```

Use interactive human sign-in or a separately approved, least-privilege CI
identity. Do not reuse the Play publisher or production FCM service account.
Check the [official IAM permissions](https://firebase.google.com/docs/test-lab/test-lab-permissions).
Do not disable billing, switch pricing plans, create credentials, or change IAM
grants as an implicit workaround.

The submission helper verifies the public JSON health endpoint through the owned
demo container's normal resolver and requires a
matching owned demo session with at least ten minutes remaining, then checks
`billingEnabled` immediately before submitting. The device independently checks
JSON health too, so a loaded Cloudflare error page cannot pass transport readiness.
It runs only when billing is verified disabled, so Spark's enforced daily quota
prevents paid usage. It refuses a billed project even when its daily free allowance
might remain: an estimate or five-minute timeout does not guarantee zero charges.
If this project is already billed, choose a separate Spark project or obtain an
explicit spending policy and implement a verified quota boundary before a run.

At the last documentation check, Spark permits five physical and ten virtual runs
per day. Blaze includes 30 physical and 60 virtual device-minutes per day, then
charges $5 per physical hour and $1 per virtual hour. Budgets are alerts, not caps.
Recheck [official quotas and pricing](https://firebase.google.com/docs/test-lab/usage-quotas-pricing)
before changing this policy. No paid usage is authorized.

## Build the capture APKs

Prepare and sync Android using the existing development container workflow first.
Then create a new disposable build directory inside that container:

```sh
node scripts/dev/prepare-test-lab.mjs --output=/tmp/persistent-test-lab-build --origin=https://YOUR-ISOLATED-DEMO-HOST
cd /tmp/persistent-test-lab-build
./gradlew --init-script capture-isolation.gradle --no-daemon --max-workers=2 assembleDirectDebug assembleDirectDebugAndroidTest
```

The preparer copies authoritative generated Android sources and bundled web
assets, excludes caches, build outputs, signing keys and Firebase client config,
and changes the copied Capacitor origin only. Production and HTTP origins are
rejected. Dependency source paths still reference the installed mobile packages;
their build outputs are redirected into the disposable copy. Nothing modifies
the active generated project or overwrites its APK. The copied assets record the
source commit, dirty state and preparation timestamp; each capture run adds its
actual device model, Android version and fingerprint in `provenance.json`.

Copy the two files from `isolated-output/app/outputs/apk/direct/debug/` and
`isolated-output/app/outputs/apk/androidTest/direct/debug/` into the checkout's
ignored `tmp/test-lab/` directory as `app-direct-debug.apk` and
`app-direct-debug-androidTest.apk`. The Cloud CLI container mounts the checkout;
it cannot upload arbitrary host `/tmp` files.

## Fixture and capture recipe

Prepare only the protected demo account with the existing `shots:prepare`
workflow against the selected isolated development database. Seed shortly before
the run so repeating reminders do not accumulate duplicate outstanding firings.
The runner signs in through the ordinary development email-code endpoints,
requires the development preview response, and verifies the account is exactly
`ryan.ewen+persistentdemo@gmail.com` before executing any recipe.

`apps/mobile/test-lab/current-screen.example.json` demonstrates the recipe format:

- `javascript` evaluates reviewed navigation or draft UI setup in the app WebView.
- `wait` requires an explicit readiness assertion, with a bounded timeout.
- `wait-native` checks real accessibility text when a native surface covers the WebView.
- `shell` performs reviewed native actions on the disposable device, such as
  expanding the notification shade. It is trusted code, not untrusted input.
- `capture` declares its `surface` (`web`, `shade`, or `alarm`) and writes a
  full-display PNG from Android `UiAutomation.takeScreenshot()`. Web captures name
  nonempty `requiredControls` (`header`, `navigation`, or `dialog`); alarm captures
  name the expected synthetic `reminderTitle`. Missing controls fail rather than
  passing an empty geometry check. Native scenes use their actual window and
  controls, with no clearance claims about a covered WebView.

`apps/mobile/test-lab/carousel.json` covers the eight real scenes using the
established synthetic medication, checklist, note, sharing draft
and assignment examples. Do not send invitations or mark reminders Done to stage
a shot. For the escalation image, create a synthetic PERSISTENT reminder with
one-minute escalation, wait for its real deadline and verify the native escalated
alarm. A standalone ALARM does not establish escalation. Delete temporary test
reminders through the same authenticated demo API when finished.

The runner grants notification, exact alarm, overlay and full-screen permissions
only on its disposable direct demo install. It also uses Android's device-idle
whitelist on that disposable install and verifies the exemption with PowerManager,
so the first-run battery sheet does not cover a capture. This lab-only grant is
recorded in provenance. It keeps its activity awake without
changing display timeout settings. Actual OEM permission behavior and successful
alarm display remain runtime gates. Native screens must be inspected, not inferred
from an instrumentation build or reported test success.

Lab-device cleanup identifies providers from active NotificationRecord entries
and applies only `POST_NOTIFICATION ignore` to non-Persistent Android, Google or
AndroidX providers. It verifies the AppOps result and records exact packages/actions
in provenance. Unknown/protected providers remain untouched. No app is stopped or
disabled, and Persistent notification permissions and obligations remain intact.
The [platform implementation](https://android.googlesource.com/platform/frameworks/base/+/c1de64d6d466524467cfd33cfd5d175d58519446%5E%21/)
describes notification removal following AppOps changes, but the final lab run
verified no successful suppression. Do not infer that this cleanup works on these
providers or infer the exact reason a provider remained from the package name.
If protected lab notifications remain, report that pixel limitation rather than
retouching, faking status bars or accepting an incomplete source.

## Submit, retrieve and review

Use a currently available virtual phone and Android version. The launcher defaults
to `MediumPhone.arm` API 36 (Android 16) and verifies its virtual phone classification and API
against the live catalog before submission. Physical models are rejected. Confirm its
gesture navigation and resolution before treating it as a store source. Device
model identifiers are fetched live rather than copied from an old example.

```sh
node scripts/dev/test-lab-run.mjs --model=MODEL_ID --version=API --origin=https://YOUR-ISOLATED-DEMO-HOST --plan=apps/mobile/test-lab/carousel.json
# Add --run only after the preceding input check and cloud prerequisites pass.
```

The wrapper uses one virtual portrait English phone, a five-minute ceiling, no flaky
reruns and no automatic Google login. It uploads the plan and exports screenshots
from the app's external Pictures/store-captures directory using the documented
`--directories-to-pull` facility. The command reports the results bucket and matrix
link. Retrieve that matrix's files through the Firebase console or the same
container's `gcloud storage cp` command into ignored `tmp/test-lab/results/`.
Do not bulk-copy results into the curated asset directories.

Inspect every PNG for the expected synthetic scenario, unique reminder names,
readable status icons, real bottom gesture bar and no unrelated notification icons.
Preserve the full shade. Convert opaque native PNGs with the existing lossless
`scripts/dev/convert-store-capture.ps1`, then use the normal manifest, Paseo mockup
rendering, contact sheet, `shots:check` and `shots:sync` workflow. Keep screenshots,
logs, source commit, device model, OS and matrix id as provenance. Compilation alone
does not prove usable image pixels or native alarm behavior.

Relevant primary documentation: [CLI workflow](https://firebase.google.com/docs/test-lab/android/command-line),
[instrumentation tests](https://firebase.google.com/docs/test-lab/android/instrumentation-test),
and [run flags and screenshot artifact retrieval](https://docs.cloud.google.com/sdk/gcloud/reference/firebase/test/android/run).

## Bounded native diagnostic

`prepare-test-lab.mjs --probe` adds the verified current UI Automator 2.4.0 only
to the disposable APK and uses the existing AndroidJUnitRunner/JUnit convention.
Submit that APK with `test-lab-run.mjs --probe`. It performs normal synthetic
sign-in and records four original app/shade PNGs, selected synthetic-title counts
from both native windows and UI Automator, bounded native window/node metadata,
actual model/API/fingerprint, sample elapsed times and alarm/battery readiness.
The isolated runner requires API 34 or newer for `executeShellCommandRwe`; the
shipping app minimum is unchanged. Read-only provider AppOps commands record exit/error categories and notification
permission fixed flags. No unrelated provider suppression is performed. Its
12-second sample observes heads-up lifecycle; it is not a production capture
readiness assertion. Diagnostic success does not establish the eight carousel
scenes or escalation. Keep all probe output in ignored evidence directories.

A resumed setup on October 11 found host DNS `ENOTFOUND` for freshly issued
Quick Tunnel names while public Cloudflare DNS resolved their A records. Health
checks therefore use the owned demo container's normal resolver, which already
performs ordinary public synthetic sign-in. The disposable demo node uses public DNS 1.1.1.1/1.0.0.1, verified to resolve the
issued names. Host and personal-device DNS remain untouched, and no fixed-IP
route is used. Startup preserves owned tunnel logs and safe health failure categories
before teardown, so a failed public route is diagnosable.

Public health can become ready before every fresh Quick Tunnel DNS query succeeds.
Ordinary synthetic onboarding therefore permits at most three attempts for
`ENOTFOUND`/`EAI_AGAIN`, which establish that no connection/request was sent.
Every request has a five-second timeout. Timeout, connection reset and HTTP/auth
failures are never replayed. Injected-fetch tests verify the bound, preserved POST
options and no retries for HTTP 401/403/503. A failed startup is still torn down
before any matrix submission.
