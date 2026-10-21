# Web and Android 0.29.0 release preparation

Prepared on 21 October 2026 in the existing uncommitted localization workspace. The coordinator owns integration, version changes, deployment, tags, Play edits and review submission. Windows remains on its separate release track; its tracked version is unchanged at 0.5.8. This document records preparation and observed state, not publication or native-speaker approval.

## Baseline and release gate

The public GitHub API reports `v0.28.0` as the latest published Android release, with `persistent-0.28.0-play.apk`. The coordinator's read-only Play snapshot reports production 0.28.0, versionCode 53, completed; phone testing tracks have no active codes. The minor proposal is 0.29.0 because the patch adds supported languages, device preferences and native Android runtime/resources/manifest behavior. Kotlin/plugin/resource/setup changes since that tag satisfy the actual Android release gate. A bundled web refresh alone would not. The root coordinator will choose the next unused workflow-derived versionCode; this preparation changes no app version or tag.

## Metadata contract

`store/listings.json` has `schemaVersion: 1` and exactly nine `locales` entries. Each contains `title`, `shortDescription`, `fullDescription`, or a Canadian `copyFrom` alias. `en-CA` aliases `en-US`; `fr-CA` aliases `fr-FR`. All nine application identities map identically to supported Play tags: `en-US`, `en-CA`, `es-ES`, `fr-FR`, `fr-CA`, `de-DE`, `zh-CN`, `pt-BR`, `ja-JP`. No Traditional Chinese or additional country listing is inferred.

`store/releases/0.29.0.json` adds `versionName: "0.29.0"` and the same locale/alias shape, with `text` for each release note. These notes describe localization, shared controls, Undo done, preserved checklist drafts and concurrent-edit protection. Admin-only growth charts are omitted from general user notes. The English preview in `listing.md` is checked against the canonical JSON. `scripts/play-metadata.mjs` is a focused dependency-free class used by the existing publisher, not another app translation runtime.

Titles fit 30 Unicode characters, short descriptions 80, full descriptions 4000 and notes 500. All fields are checked before OAuth or any Play edit, and curated notes are rejected instead of truncated. Version mismatch, missing/extra locales, unknown fields and invalid aliases fail closed. Translations preserve Persistent branding and literal user-entered content. The full descriptions disclose that current screenshots are English, state relevant Android permission/force-stop limits and retain medication disclaimers without claiming medical-device status or translated legal review.

## Full Play surface audit

| Surface | Observed baseline / source evidence | Prepared action |
| --- | --- | --- |
| App title, short and full descriptions | Read-only API snapshot has only `en-US`; title is Persistent: Reminders That Nag | Nine complete text listings; Canadian aliases keep separate identities |
| What's New | Production 0.28.0/code 53; existing tooling writes English | Curated version-bound nine-locale 0.29.0 notes; release and notes-repair workflows consume them when present |
| Default language / listing translations | API default `en-US`, one existing translation | Preserve default; add eight translations without deleting unknown future entries |
| Screenshots / captions / icon / feature graphic / video | Existing eight synthetic-data English screenshots, icon and feature graphic; video is a distinct field | Preserve all assets and ordering; no new captures or implied translated screenshots |
| Health declaration | Coordinator observed no health features selected despite medication support; subsequently saved Medication and treatment management as the only selected feature, pending review/readback | Coordinator reports the corrected selection saved pending review, with no additional regional requirements; final readback/submission are separate. Localization itself is not the reason for the correction |
| Data safety | Coordinator observed Personal info, Health and fitness, App activity and Device IDs groups; App interactions and Other user-generated content selected, Other actions unchecked | Compare actual selected labels and collection/sharing purposes. Four summary groups do not prove missing health/activity types. No speculative category changes |
| Account deletion | Correct public `/delete-account` URL already configured. An optional question asks about deletion without deleting the account | Preserve URL. Evaluate optional partial deletion separately; its summary is not evidence that account deletion is unsupported |
| Privacy policy | Public `/privacy`; source now explains account email language, device notification language registration and local display preferences, dated 21 October 2026 | Deploy the canonical English update with the hosted app. Preserve URL; no translated legal documents claimed |
| Restricted permissions / health claims | Exact alarm, full-screen intent and foreground-service behavior unchanged; Play flavor excludes direct updater and Android Auto | Preserve declarations and demonstration videos unless the actual Console fields or built artifact require correction. No target-SDK change in this patch |
| App access / reviewer instructions | Entire reminder surface needs sign-in. Existing fixed-code review path is explicitly scoped to one synthetic account and must be live during review only | Coordinator reports a fresh privately retained code and matching Console sign-in instructions saved, with server configuration staged for deployment. The owner has not tested the live credential. Never put the code in source, artifacts or logs |
| Contact / support links | API contact website `https://dynamic-solutions.ca`, email `contact@dynamic-solutions.ca`; public privacy/deletion links retained | Preserve existing destinations and support language expectations; no promise of localized support |
| Category / tags / rating / audience / ads / purchases / policy status | Existing Productivity product; coordinator reports App content Need attention empty and 13 actioned entries, no current policy issues | Preserve current answers unless actual fields and product evidence require a correction. Localization alone does not imply new data uses, ads, purchases, audience or health status |
| Country availability | Production API has 177 countries and `restOfWorld: true` | Preserve distribution exactly; a supported language is not a request to add countries |
| Custom listings / translations of legal/support assets | No custom listing creation requested; legal pages remain English | Do not create country-targeted/custom listings or translate policy documents as a side effect |

Read-only Console evidence and final publication evidence belong to the coordinator. This source preparation does not certify Console forms that have not been read back, reviewer credentials that have not been tested, review approval or public availability.

## Reviewer instructions draft

Provide the current designated review email and fixed review code only through the private Console credential fields. Use a synthetic account with no real medication or reminder data. The following instruction text contains no credential:

> Sign in using the review email and code provided in the credential fields. On the email sign-in screen, request a code, then enter the supplied review code. Do not use a personal Google account or passkey. Language can be changed on the sign-in screen and in Settings. On Android 13 or newer the in-app language setting also uses Android's per-app language preference. Date formatting, 12/24-hour display, account time zone and email language are separate settings. Create a synthetic reminder, allow the requested notification/alarm permissions, and select a notification or alarm. Swiping away a notification does not complete it. Done requires two taps; Snooze postpones it; De-escalate stops an escalated alarm while retaining a notification. Medication reminders store user-entered names and doses only and do not provide medical advice. The Play build does not include Android Auto or an in-app APK updater. Current listing screenshots are English.

The coordinator must ensure the private review path is enabled before submission and clear it after review, following `docs/auth-architecture.md`. This owner has not changed production credentials or account data.

## Publishing handoff

Run these from `apps/mobile` using the existing privately configured `PLAY_SERVICE_ACCOUNT_JSON`. The owner has not run a live edit or publication. A comparison uses a temporary Play edit and discards it; coordinate with Console work so concurrent edits cannot invalidate one another.

```sh
# Compare every localized text field; does not write text, images or details.
node scripts/play-publish.mjs --listing-json store/listings.json --check

# Coordinator publication after review, text only.
node scripts/play-publish.mjs --listing-json store/listings.json

# Existing uploaded build only, if repairing notes after publication.
node scripts/play-publish.mjs --set-notes --version-code <published-code> --tracks production --version-name 0.29.0 --localized-notes store/releases/0.29.0.json
```

The manual `play-listing` workflow uses the JSON contract. Existing locales are patched; new locales use the documented create/update operation. All nine writes share one edit, and a failure discards it without partial publication. Existing video/graphics, app details, unknown translations and distribution remain untouched. The release workflow automatically selects curated notes for the exact version when the file exists, otherwise retaining the generated English behavior. The notes-repair workflow uses the same precedence and preserves rollout fields. Add the listing translations before preparing localized release notes in Console. Recheck live diff immediately before publication. API commit success alone does not prove submission, approval or public visibility; inspect all pending changes and Publishing overview.

Web deployment applies only the additive `User.emailLanguage` and `PushSubscription.locale` migration through the existing startup workflow. Root integration/deploy/tag guards remain intact. No production migration is performed by this owner.

## Verification and limits

The retained owner evidence index is `.artifacts/localization/README.md`. It separates Node 20 validation, focused metadata/FCM/bridge tests, both-flavor Android compilation/JVM tests, previous synthetic browser/API evidence, and Windows compile/package proof. FCM ranges are lossless UTF-16 indexes into the legacy localized body, with boundary tests counting UTF-8 keys and values. No payload text is silently truncated or replaced with a sync-only notification.

Physical Android picker/offline/reboot/channel/audio behavior and native-speaker translation review remain unqualified. Windows native installation/runtime is pending separately. This patch neither changes those limits nor invents a new release approval step. The coordinator owns the actual release decision and final live verification.

## Primary references checked

- [Supported Play translation tags](https://support.google.com/googleplay/android-developer/answer/9844778?hl=en) support all nine exact application locale identities.
- [Store listing fields and limits](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en) distinguish text, localized graphics, contact details and default language.
- [Listing API resource](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.listings) defines language, title, descriptions and video as separate fields.
- [Release preparation and note limits](https://support.google.com/googleplay/android-developer/answer/9859348?hl=en) specifies 500 Unicode characters per language and translation setup before localized notes.
- [Health declaration categories](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en) explicitly include medication reminders in Medication and treatment management.
- [Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en) distinguish app interactions, other actions and other user-generated content; inspect actual behavior instead of inferring from localization.
- [FCM payload limit](https://firebase.google.com/docs/cloud-messaging/error-codes) counts both keys and values toward the 4096-byte direct-device limit.
