# Mobile guidance (`apps/mobile`)

Capacitor (Android) wrapper of the built web app plus the custom native alarm
plugin: where the hard alarm guarantee actually lives. Architecture is in
[`docs/alarm-architecture.md`](../../docs/alarm-architecture.md); build, wireless
adb and signing are in `README.md`.

## Standards

This shell follows the Capacitor rules of the shared Android stack index, https://github.com/Dynamic-Solutions-Canada/app-standards/blob/main/stacks/android.md, on top of the root file's web standards. Where this file differs, it says why.

## Verifying native changes

**Levels (PLAT-11).** `minSdk` is 24 (Android 7.0) for both distributions: the oldest version Google Play's automatic protection supports, which the app keeps. Raising it strands installed users, so it changes only on the maintainer's decision. `targetSdk` and `compileSdk` are 36, the level Play requires for updates, and Java source, target and the build image are JDK 17 (Capacitor's own modules compile at 17). `setup-android.mjs` owns all of these pins together with AGP and Gradle; do not rely on the generated Capacitor template's defaults. The README's Android requirements state the same `minSdk`.

**A target-SDK bump needs a device, not just a compile.** The move to `targetSdk 35`
compiled clean and still broke the alarm on real hardware (`BAL_BLOCK` collapsed the
full-screen surface whenever the phone was unlocked). Treat "both flavors compile" as
the floor, and see `store-assets/play/play-readiness.md` #2a for the checklist to run on a phone
after one.

**Native (Kotlin/Java) changes aren't covered by `npm run validate`.** The
development image ships JDK 17 + the Android SDK (platform-36, build-tools 36.0.0; the
app targets API 36; `setup-android.mjs` pins the compileSdk/targetSdk, AGP and Gradle
versions together, since AGP caps the compileSdk it will build), so
verify them by compiling: from here, `npm run verify:android` (re-syncs
`android-plugin/` into the generated project, then compiles the Kotlin **and**
Java tasks for **both product flavors**), then `npm run test:android` for the JVM unit tests in `android-tests/`. All four compile tasks matter: the plugin is
Kotlin but `MainActivity.java` is Java, and the Kotlin task alone compiles right
past a broken `MainActivity`. Run `npm run prepare:android` once first if the
generated `android/` project doesn't exist yet. The scripted Gradle commands
disable the persistent daemon and default to two workers so a compile cannot
starve WSL; only raise `ANDROID_GRADLE_WORKERS` deliberately. The same command
also runs JVM unit tests for both flavors. Keep their authoritative Kotlin tests and pure Java helpers
in `android-tests/`; setup copies them into the generated project's test source set.

`npm run lint:android` runs Android lint for both flavors; errors fail it and CI, warnings do not. A false positive is suppressed on its line with `@SuppressLint` and the reason, never with a baseline file. `npm run check:android-notices` renders every variant's third-party notices (`android-plugin/third-party-notices.gradle`); a new dependency under a licence outside its allowlist fails the build until the licence is read and added there.

Tests in `android-tests/device/` run on Android, not the desktop JVM. This matters for ICU regex parsing, including `NativeText` startup initialization. After `setup:android`, build with `./gradlew --no-daemon --max-workers=2 assembleDirectDebug assembleDirectDebugAndroidTest` from `android/`. On an explicitly authorized test device, install both APKs and run `adb shell am instrument -w -e class ca.persistent.app.alarm.NativeTextTest ca.persistent.app.test/androidx.test.runner.AndroidJUnitRunner`. `verify:android` does not execute these device tests.

## Two Android flavors

`android-plugin/flavor/`: `play` for Play and GitHub distribution, `direct` for legacy installs and
local development. GitHub APKs are downloaded from Play and verified against
the registered Play certificate; never substitute a locally signed APK. Two things live in `direct` only, each because Play would object:

- **the updater marker**: `direct` registers an empty `UpdatePlugin`, whose presence makes the page show the move-to-Google-Play notice. The in-app download and install, and `REQUEST_INSTALL_PACKAGES` with it, are retired from both flavors; Play forbids an app it distributes from updating itself, and release.yml still fails a Play bundle carrying that permission.
- **the whole Android Auto integration**: the car screen (`ReminderCarAppService` +
  its screens) _and_ the notification mirror's `com.google.android.gms.car.application`
  declaration. A templated car app must declare one of Auto's approved categories and a
  reminder app is none of them. The mirror used to be judged separately, on the grounds
  that it "needs no category". That was true, but it said `<uses name="notification"/>`, which
  declares the app a **messaging** app, and review then tests it for sending and
  receiving messages, which no reminder app can pass (Play's 2026-08-17 notice). The
  descriptor now says `<uses name="template"/>` and the mirror is a `CarAppExtender`, so
  that false claim is gone. Both halves are `direct`-only because they are now literally
  the same declaration, and the Play build has no Auto surface
  (`store-assets/play/play-readiness.md` #1b). The AndroidX dependency,
  projection observer, notification extender, refresh broadcast, manifest declarations,
  and car resources are all direct-only. Shared callers compile against no-op play
  implementations. `AgendaStore` remains shared because the sync writer must not have to
  know whether a reader was compiled into this flavor.

Direct-only Kotlin sources are listed in `scripts/setup-android.mjs`
(`DIRECT_ONLY_KT`) and their manifest entries in `flavor/direct/AndroidManifest.xml`;
`res/xml/automotive_app_desc.xml` is copied into that flavor's `res/` by the same script
(`AUTO_DESC_REL`), which also deletes a stale copy from `src/main`. **Check a policy
split on the built APK, not the source.** The Auto entry reached the Play build for
months because `setup-android.mjs` merged it into `src/main`, where no `play` source
file mentions it.
`MainActivity` is shared and calls `FlavorPlugins.register(this)`, which each flavor
supplies.
Build with `npm run assemble:release` (direct APK) or `npm run bundle:play` (Play
AAB). Both flavors load the _same_ hosted web bundle, so any updater UI must gate
on `hasNativeUpdater()` (`apps/web/src/native/alarmBridge.ts`), never
`isNative()`.

## Play listing assets

Use the [repeatable store capture workflow](../../store-assets/README.md) and
`.agents/skills/store-screenshots/SKILL.md`. `npm run shots` prints the entrypoint;
`shots:prepare` creates only the protected synthetic demo fixture, `shots:render`
generates reusable phone layouts, and `shots:check` validates final PNG exports.
Capture all Play source screens in an explicitly requested device session using
the isolated demo Android app. Preserve the real status area and gesture bar on
every image, with readable system icons and no unrelated notification icons.
Render the marketing layouts in the shared Paseo browser; do not install a
standalone browser for this workflow. Follow the workflow's permission, account, and cleanup
steps; preserve the signed-in Store app. Keep native permission demonstration
videos separate.

The experimental [Test Lab capture workflow](../../docs/test-lab-store-captures.md)
uses virtual Android 16 by default with a fresh synthetic-only server and disabled
billing. Keep lab instrumentation and diagnostic geometry helpers in test sources,
never the shipping app. Its runtime gates are separate from native compilation;
failed or contaminated captures do not replace approved Store assets.

`store-assets/play/listings.json` owns the nine-locale titles/descriptions; `store-assets/play/listings.md` holds the Console-only settings and the published screenshot record. The manual `play-listing` workflow uses `scripts/play-publish.mjs --listing-json` for text, preserving graphics; its opt-in `images` input adds `--images`, which sets every language's phone screenshots from its own locale's `play` files in `store-assets/manifest.json` (en-CA and fr-CA get en-US's and fr-FR's), in the same edit. Each locale's set shows Android, the app and its sample data in that language; a missing locale fails before any Play call. The icon and feature graphic stay untouched. Release notes are per version, in every wording, in the root `release-notes/` folder (see its README). The older `--listing` screenshot replacement requires an explicit screenshot publication request. Medication reminders are available, so the listing,
Health apps declaration, and Data safety declaration must cover medicine names
and doses accurately.

A successful API commit confirms the upload, not review submission or public
availability. Check Play Console's Publishing overview after publishing. Inspect
all pending items before sending the approved changes for review, then confirm
the screenshots appear under Changes in review.

## Google Play releases

**Do not cut an Android version for web, server, desktop, Store listing, docs,
or tooling changes alone.** Compare against the last Android tag first. Only a
native runtime, resource, plugin, manifest, or build-configuration change needs
a new APK/AAB. A refreshed bundled web fallback is not enough by itself. See
`.agents/skills/release/SKILL.md` for the release gate.

**Production is the only release track.** Tags and manual release runs publish
straight to production and clear active phone testing releases in the same edit.
The manual `play-promote` workflow is for an existing uploaded versionCode or a
production rollout adjustment; it uploads nothing and also retires testing releases.
Never add tester-track defaults or destinations back into the release workflows.
