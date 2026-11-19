---
name: release
description: Bump the product version with approved notes, and cut an Android release (android-vX.Y.Z) when native code changed, letting CI build the AAB for Google Play and the signed APK for the GitHub Release. Use when asked to release, or before a deploy that needs a new version.
---

Bump the product version and, when native code changed, cut an Android release.

## Versions and tags

Persistent has one product version: the root `package.json`, with `apps/web` kept equal
(REL-1). Only this skill changes it. Each bump commits that version's product notes,
`release-notes/X.Y.Z.md` and its translations. The `deploy` skill tags the deployed commit
`vX.Y.Z` and refuses a version that is already tagged, so a deploy that ships new web or
server changes needs a bump here first.

The Android app is a lane: its release is tagged `android-vX.Y.Z`, using the same version
number, and needs `release-notes/android-X.Y.Z.md` with its translations. Plain `vX.Y.Z` tags
up to v0.30.1 are earlier Android releases and are never moved or reused.

## Linux lane

When asked to release the Linux desktop host, use its independent `linux-vX.Y.Z`
tag and `apps/linux-desktop/package.json` version, independently of Android and Windows.
Do not invoke the Android lane for Linux-only work. Before tagging, write `release-notes/linux-X.Y.Z.md` (en-US, user-facing), run `npm run check:notes`, and stop for approval of the text; the workflow refuses a tag without it. Keep its standalone lockfile in
step, validate and package both architectures, review native evidence, commit/merge
and push main, and deploy the hosted bridge before publishing the tag. Require a
clean tree and HEAD equal to origin/main. `release-linux.yml` builds x64 and ARM64 AppImages plus the shared checksum
manifest; watch both builds and publishing to completion. Verify all three release assets and keep Android as GitHub Latest.
Downloads and installation require separate native consent; automatic checks can
be disabled. No portable tar release is offered. Report the release URL and limits.

## Android lane

Invocation input (optional): the user-provided bump level, pause request, or dry-run request.

The release pipeline is `.github/workflows/release.yml`: pushing an `android-vX.Y.Z` tag
builds the web bundle and the signed Play AAB, reads that version's approved notes from
`release-notes/` (see `release-notes/README.md`), and publishes one Play identity through
both channels. It stops before building when any wording of the notes is missing or over
500 characters; it never generates or truncates notes.

- `play` -> **AAB** released to Google Play **production**, with every wording of the notes as
  its per-locale "What's new". `PLAY_SERVICE_ACCOUNT_JSON` is required.
  Tags and manual releases have no tester-track destination. Active phone testing
  releases are retired in the same edit using `--production-only`.
- Google Play's **signed universal APK** -> GitHub Release, named
  `persistent-X.Y.Z-play.apk`, after verifying package, version and the registered
  Google certificate. No direct APK fallback is allowed. Its body is the en-US notes, and
  the workflow appends the AI-disclosure line.

Legacy direct installs have a different package and certificate and cannot update
in place. The hosted UI explains the separate installation and offers both manual
GitHub downloads and Google Play; using the Store is optional. The compatibility updater
endpoint returns `null`. Keep legacy passkey origins and asset links authorized.

Both Android flavors require Android 7.0 (API 24) to retain Play automatic
protection.

**Device check before tagging (TEST-9).** Native behaviour that only a phone shows is checked on a real device with the release build first (the `test-android-device` skill), and the result goes in the report. Besides the alarm path (rings, Done and Snooze clear it), check what the release changes; for the next release that is: nothing yet (0.31.2 checked the previous list on November 19, 2026). List each native change here as it lands.

Remove an item once a release has checked it.
The manual `replace-github-apk` workflow exports an existing Play versionCode,
preserves approved notes, and replaces the direct asset without uploading an AAB.

Production is open. The first production release was versionCode 47 (v0.23.0)
on 2026-09-05. The maintainer changed the release policy to production-only on 2026-10-02.
An explicit request to cut a release authorizes its production publication.
The manual `play-promote` workflow is only for an existing uploaded versionCode
or a production rollout adjustment. It targets production, carries forward the
source notes and clears active phone testing releases without rebuilding.
If promotion is refused, the edit stays uncommitted and the publisher prints
the Console-side checklist. See `store-assets/play/play-readiness.md` #6b.

Never publish the `direct` APK to Play: it carries two things the `play` flavor
deliberately omits: the in-app updater with `REQUEST_INSTALL_PACKAGES`, which Play
prohibits, and the Android Auto car screen (`ReminderCarAppService`), which would draw
an Auto review against a category this app can't honestly claim. The workflow asserts
both are absent from the Play bundle before uploading ("Verify the Play bundle carries
no direct-only components"); see `store-assets/play/play-readiness.md` #1 and #1a.

This command decides the next version, records it, and pushes the tag.

Requirements:

- The working tree must be clean and `HEAD` must equal `origin/<default branch>`
  before tagging (commit and push first; use `commit` or `deploy` if there are
  pending changes). If it isn't, stop and say so.
- Determine the **last version** from the root `package.json`, and the **last Android
  release** from `gh release list` (newest `android-vX.Y.Z`, falling back to the newest
  `vX.Y.Z` before the lane existed).
- **Gate the Android release before bumping anything.** Compare the last Android
  tag with `HEAD` for native Android runtime code, resources, plugins, manifest,
  or build configuration. Web and server changes delivered by `deploy`, desktop
  changes, Store listing assets, documentation, and tooling do not justify an
  Android version. An APK would bundle a newer web fallback, but that alone is
  not a reason to release it. With no qualifying native change, bump the product
  version only (when the invocation asks for one, for example before a deploy) and do not
  tag an Android release; otherwise report that no Android release is needed and stop.
  Only bypass this gate when the user explicitly requests a new Android binary
  for a concrete reason.
- Derive the **next version** from the commits since that tag
  (`git log <lastTag>..HEAD --pretty=%s%n%b`), unless the invocation forces a
  level (`major` / `minor` / `patch`):
  - **major** if any commit indicates a breaking change (`BREAKING CHANGE`, or a
    `type!:` subject).
  - else **minor** if any commit adds functionality (subject starts with `feat`,
    `Add`, `add`, or clearly introduces a feature).
  - else **patch** (fixes, refactors, docs, chore, UI tweaks).
    Increment from the last release version accordingly (e.g. patch: `0.1.3 -> 0.1.4`,
    minor: `0.1.3 -> 0.2.0`, major: `0.1.3 -> 1.0.0`).
- Keep the root `package.json` and `apps/web/package.json` `version` in sync: set
  both to the new version (the web one is the in-app displayed version and web build
  version; the root one labels the deployed server image). The APK's
  versionName comes from the tag in CI; versionCode from the run number plus the
  `PLAY_VERSION_CODE_OFFSET` repo variable (unset = 0).
- **Regenerate the lockfile after bumping**: `npm install --package-lock-only`.
  `package-lock.json` records each workspace's version, editing `package.json`
  alone leaves it stale, and `npm ci` then bakes the wrong version into the built
  image. `scripts/dev/workspace-versions.test.ts` fails the build if you forget,
  so `npm run validate` catches it, but do it as part of the bump commit.
- Do NOT invent a version when uncertain: show the computed bump and the commit
  summary it's based on; if the invocation says `confirm first` or `dry run`,
  stop after showing the plan (don't tag).

Recommended steps:

1. `gh release list --limit 5` (and `git tag -l 'android-v*' 'v*' --sort=-v:refname | head`)
   to find the last release version.
2. Check `git diff --name-only <lastTag>..HEAD` against the Android release gate.
   If it finds no qualifying native change, stop here. Otherwise use
   `git log <lastTag>..HEAD --pretty=format:'%s'` to classify the bump (or honor
   a forced level from the invocation).
3. Compute the next `X.Y.Z`. Summarize: last version, new version, the bump
   level, and the notable commits driving it.
4. If `confirm first` / `dry run`: print the summary and stop.
5. Draft the notes from the user-facing changes since the last version: always the product
   notes `release-notes/X.Y.Z.md` (en-US; the web and server changes a deploy will ship), and
   for an Android release `release-notes/android-X.Y.Z.md` from the changes since the last
   published Android release (not failed tags, drafts or desktop releases), translated into
   `android-X.Y.Z.<identity>.md` for es-ES, fr-FR, de-DE, zh-CN, pt-BR and ja-JP.
   Run `npm run check:notes`. **Stop and show every wording, not only en-US**, and wait for
   the maintainer (or their delegated release approver) to approve the text; record who
   approved. The translations reach the stores only through this approval. Another agent's
   go-ahead counts only when it relays the maintainer's approval of this text.
6. Then bump the root `package.json` and `apps/web/package.json` to the new version, run
   `npm install --package-lock-only` so the lockfile follows, and commit both
   (`Bump version to vX.Y.Z`, REL-2), together with the approved notes files.
   Run `npm run validate` first; fix failures before continuing.
7. `git push`. For an Android release, then `git tag -a android-vX.Y.Z -m "Android X.Y.Z"`
   and `git push origin android-vX.Y.Z`. Never create a plain `vX.Y.Z` tag here: that is the
   deploy's.
8. Watch the workflow: `gh run watch <id> --exit-status` (find it via
   `gh run list --workflow=release.yml --limit 1`). Confirm the release published
   with only the verified `-play.apk` asset (`gh release view android-vX.Y.Z`), then check the "Release to Google
   Play" step logged the versionCode against `production`, then run `play-check`
   to verify production holds it and phone testing tracks have no active releases. A failure
   in the earlier "Pre-flight Play release" step means the versionCode collides
   with one Play already has: the step's output names the
   `PLAY_VERSION_CODE_OFFSET` value to set, after which re-run the workflow.
9. Report the new version, the bump reasoning, who approved the notes, and the release URL.

Notes:

- Web and server changes reach devices through the production deploy (`deploy`).
  Their presence in the bundled web fallback does not override the Android
  release gate.
- `ANDROID_*` secrets sign the AAB with the upload key. Google signs the
  distributed APK; verify that signer against the existing asset-links trust list.
- Never tag a version older than or equal to the last release, and never move an existing tag.
