# Google Play store listing — Persistent

English preview and Console audit guidance. The canonical nine-locale text source is [`listings.json`](listings.json), validated by `PlayMetadata`. The English fenced blocks below mirror that source for legacy screenshot tooling; update them together.
Package: `ca.dynamicsolutions.persistent` (Play) · Category: Productivity

Both Google Play and current GitHub APKs use the Google-signed `ca.dynamicsolutions.persistent` Play build. Only legacy/local direct builds use `ca.persistent.app`; these have a different signer and package and cannot update in place to the Play build.

> Medication reminders are available again under the organization developer account.
> Keep this listing, its screenshots, the privacy policy, and Play Console's Health apps
> and Data safety declarations aligned with the hosted app.

---

## App name (max 30 chars)

```
Persistent: Reminders That Nag
```

*(30/30.)*

## Short description (max 80 chars)

```
Reminders that return until confirmed. Alarms, checklists and shared reminders.
```

*(79/80.)*

## Full description (max 4000 chars)

```
A swipe should not mean done. Persistent keeps reminding you until you explicitly confirm completion.

Choose a returning notification, a looping alarm, or a notification that escalates to an alarm after a delay or at a chosen time. Done uses a deliberate two-tap confirmation. Snooze postpones the alert; de-escalating stops the alarm sound while the notification keeps reminding you.

Each scheduled firing is independent. An unfinished morning reminder stays active when the afternoon one fires. Completing one never silently clears another.

Alarms are scheduled on your Android device and can fire offline with the app closed. Allow notifications, exact alarms and any requested alarm permissions for the intended behavior. Android settings and force-stopping the app can prevent alerts; reopen the app after a force stop.

Reminders for real life
• One-time, daily, weekly, every-N-days, custom weekday and monthly schedules, including the last day of the month
• Up to 24 times a day, start/end dates, skip weekends and pause
• Checklists with independent progress for each firing; ticking the last item does not mark the reminder done
• Snooze presets, a custom duration or a specific date and time
• Your choice of notification and alarm sounds
• History and Undo done when you need to restore a completed firing
• Notes and checklists without alarms

Share or assign
Invite someone by email. Shared members can edit and complete reminders for the group; snooze and alarm escalation remain personal. Assign a reminder to one person and follow their progress without taking over their alerts. An unconfirmed reminder can also escalate to your other devices and an email contact you choose.

Your language, your formatting
Use English (US or Canada), Spanish (Spain), French (France or Canada), German, Simplified Chinese, Brazilian Portuguese or Japanese. Match the device or choose an interface language in Settings. Keep regional date formatting, 12/24-hour display, account time zone and email language separate. Reminder text, medicine names and doses stay exactly as you enter them. Screenshots currently show the English interface.

Medication reminders
Keep medicine names and doses with your reminders. Persistent is not a medical device and does not diagnose, treat, cure or prevent any medical condition. Consult a healthcare professional for medical advice, diagnosis or treatment.

A free account is required for syncing and escalation. Sign in with an email code, Google or a passkey. Manage reminders in a browser at persistent.dynamic-solutions.ca without installing an app. Changes sync across your signed-in devices when connected.
```

Validate all locale fields offline with the metadata tests. For an authenticated read-only comparison, run from `apps/mobile`: `node scripts/play-publish.mjs --listing-json store/listings.json --check`. Publication uses the same command without `--check` and is performed separately by the coordinator. It updates titles and descriptions, preserving images, video, default language, contact details and country distribution. Curated release notes are version-bound in `releases/0.29.0.json`.

All nine app locale tags map identically to supported Play tags. `en-CA` explicitly aliases `en-US` copy and `fr-CA` aliases `fr-FR`; their published identities remain distinct. No Traditional Chinese listing is added. Existing English screenshot captions and screens remain English; translated descriptions disclose this. Legal pages remain canonical English, with no claim of translated legal review. Translation drafts have automated completeness/limit checks but no native-speaker qualification.

---


> **No Android Auto copy here, deliberately.** The description carried a "WORKS IN THE
> CAR" section until 2026-08-18. The Play build no longer projects to Auto at all (the
> `com.google.android.gms.car.application` declaration is direct-only — see
> `docs/alarm-architecture.md`), so the claim became false, and an Auto claim in the
> listing is also what invites the Auto review that flagged the app as a messaging app
> in the first place. The legacy/local direct flavor still does it; current GitHub Play APKs do not. The store copy must not say so.


## Graphics

| Asset | Spec | Status |
| --- | --- | --- |
| App icon | 512×512 PNG, 32-bit, no transparency | ✅ `graphics/play-icon.png` |
| Feature graphic | 1024×500 PNG/JPG, no transparency | ✅ `graphics/feature-graphic.png` |
| Phone screenshots | 2–8, min 320px, 16:9 or 9:16 | ✅ 8 in `graphics/screenshots/` (see below) |
| 7" / 10" tablet screenshots | optional | ❌ optional |

Sources are `graphics/*.svg`; re-render with
`rsvg-convert -w 512 -h 512 play-icon.svg -o play-icon.png`.

### Capturing more

Use the [repeatable store screenshot workflow](../../../store-assets/README.md).
It prepares a protected synthetic demo account, captures all eight source screens
in the isolated Android demo app, and renders reusable phone mockups through the
shared Paseo browser. `npm run shots`
prints the workflow entrypoint; it does not launch or install a browser.

**Always capture against the demo account, never a real one.** The owner's real
account contains actual prescriptions; a Play listing is public and permanent.
Native captures require a separately requested device session. Every image
includes the real status area and gesture bar, with no unrelated notification icons. Keep native permission demonstration videos separate from the carousel.

---

## Store settings

- **App category:** Productivity (preserve the existing category; medication functionality still requires an accurate Health declaration)
- **Tags:** Reminders, To-Do Lists, Productivity
- **Content rating and audience:** preserve the current declarations unless the actual questionnaire and product behavior require a change. Sharing, assignment invitations and user-authored escalation emails must be evaluated against the exact questions; localization alone does not change the answers.
- **Contact email:** `contact@dynamic-solutions.ca` (required, publicly displayed — same address as the privacy policy)
- **Privacy policy URL:** `https://persistent.dynamic-solutions.ca/privacy`
- **Account deletion URL** (Data safety → *Provide a way for users to request account deletion*): `https://persistent.dynamic-solutions.ca/delete-account` — resolves signed out, explains the in-app route and gives an email fallback
- **Ads:** No
- **In-app purchases:** No

### App access (required — the whole app is behind sign-in)

Play reviewers must be given working credentials, and they cannot use any normal
path here: sign-in is passwordless (emailed one-time code, Google, or passkey) and
a reviewer has no access to the mailbox. A designated review account can therefore
sign in with a fixed code — see `docs/auth-architecture.md` and set
`REVIEW_ACCOUNT_EMAIL` / `REVIEW_ACCOUNT_CODE` in the **production** env.

Choose "All functionality is restricted" and give one instruction set:

```
Username / email:  <REVIEW_ACCOUNT_EMAIL>
Password / code:   <REVIEW_ACCOUNT_CODE>

Instructions:
1. Open the app and tap "Use email instead".
2. Enter the email address above, then tap "Send sign-in code".
3. Enter the code above and tap "Sign in".
   (This account uses a fixed code; no email is sent and none is needed.)

The account is pre-populated with example reminders. To see the core behaviour,
open a reminder that is due and tap Done — it asks for a second confirming tap,
which is the app's central guarantee: a reminder is only cleared by an explicit
confirmation, never by dismissing a notification.
```

Do not paste the real code into this file: it is a shared secret and this repo is
public. Keep it in the server `.env` and the Play Console form only.

**Set it fresh for each submission and clear both vars once the review concludes.**
The code never expires, so leaving it set between reviews is a standing credential on
an account whose address this file names. Unsetting `REVIEW_ACCOUNT_EMAIL` and
`REVIEW_ACCOUNT_CODE` in the production env removes the path with no other effect
(`docs/auth-architecture.md`), and the next submission simply sets it again. Cleared
after the production approval of 2026-09-05.

---

## Data safety declaration

Source review against `apps/api/prisma/schema.prisma`; this table is an audit proposal, not proof that the current Console form matches. All types are **collected and
linked to the user**; none are used for advertising, analytics, or tracking (the
repo contains **no** analytics or crash-reporting SDK — grep for sentry /
crashlytics / firebase-analytics / posthog / amplitude / gtag returns zero hits).

| Play data type | Collected | Shared | Purpose | Notes |
| --- | --- | --- | --- | --- |
| Email address | Yes | Yes | Account management, app functionality | Sign-in codes via Cloudflare; user-set escalation contact |
| Name | Yes | No | Account management | `displayName`, only if signing in with Google |
| Other user-generated content | Yes | Yes | App functionality | Reminder titles/details, sent in push payloads and escalation emails |
| Health info | Yes | Yes | App functionality | Medication names and doses; reminder text can reach FCM push and user-chosen escalation email |
| Device or other IDs | Yes | Yes | App functionality | FCM device tokens |
| App activity / app interactions | Yes | Yes | App functionality | Occurrence log: fired, acknowledged, snoozed times; assignment creators can see firing status and completion times |

**Declare sharing = Yes.** Google FCM receives reminder titles and bodies in push
payloads. Cloudflare Email Sending handles sign-in codes and invitation and
escalation emails. A user can share reminder content with other participants,
and an assignment creator can see the assignee's firing and completion status.
None of this is a transfer for advertising.

Security practices to declare:
- ✅ Data is encrypted in transit (HTTPS everywhere; `cleartext: false`, HSTS-style proxy, `Secure`/`HttpOnly` session cookie)
- ⚠️ **At rest, Postgres columns are plaintext** — only session secrets and email codes are hashed. Don't over-claim encryption at rest.
- ✅ **"Users can request data deletion" is true, so claim it.** Two routes, both live: in-app at Settings → Delete account, and the public URL above for anyone who cannot sign in. `DELETE /api/auth/me` requires the caller to type their own email, so a session cookie alone will not fire it. Verified end to end against a throwaway account: the user, reminders, occurrences, sessions and the `EmailCode` rows (keyed by address, so they have no cascade and are deleted explicitly) all go.

Medication reminders store medicine names and doses. The Health apps declaration must select Medication and treatment management. On 21 October 2026 the coordinator observed the separate Health declaration still selecting no health features, and then saved the corrected Medication and treatment management selection as pending review. Final readback and submission remain coordinator-owned. Data safety must be checked using actual selected labels, not summary group counts: Health info and app interactions can already be selected even when a summary shows four groups. The optional data-deletion-without-account-deletion answer is distinct from the already configured account-deletion URL. Language preferences are app settings used for functionality, not evidence by themselves of a new sensitive data category or changed sharing purpose. See [release audit](release-0.29.0.md) for current evidence and handoff.

---

## Captured screenshots

All eight live in `graphics/screenshots/`, using the seeded demo account with
synthetic health data only. All eight are full-display Pixel 9 Pro captures with
the real status area and gesture bar, and no unrelated notification icons.
All are composed in Paseo
inside reusable phone mockups, with 1080 x 1920 RGB PNG exports. Marketing copy
describes the feature without theme names.
Ordered as they should appear in Play:

| File | Shows | Theme |
| --- | --- | --- |
| `00-current-light.png` | Current reminders for plants, puppy, and the morning checklist | Enjoy Light |
| `01-notification-shade.png` | Four distinct reminders, native Done and Snooze actions, and copy explaining that swiped notifications return until confirmed | Android system |
| `02-alarm-dark.png` | Real ignored-reminder escalation into an alarm with Done, Snooze, and De-escalate controls | Enjoy Dark |
| `03-checklist-dark.png` | Reading dialog with a part-completed checklist and reminder controls below it | Enjoy Dark |
| `04-medication-light.png` | Synthetic vitamin reminder editor with medicine name and 1000 IU dose | Enjoy Light |
| `05-sharing-dark.png` | Share or assign dialog with a staged sample recipient | Enjoy Dark |
| `06-notes-light.png` | Trip-packing note checklist, without an alarm | Enjoy Light |
| `07-assigned-dark.png` | Assigned by me status with a synthetic completion record | Enjoy Dark |

The root README embeds `00`, `03`, and `05` from this directory, without separate
copies. Native permission videos remain separate.
No screen repeats a reminder as two near-identical cards.

### Regenerating

Use [store-assets/README.md](../../../store-assets/README.md) and its manifest.
Prepare the synthetic fixture, capture all eight screens in the isolated Android
demo app through the authorized device session, then render
the phone layouts and capture their final exports. If waiting has allowed another
scheduled firing to create duplicate demo cards, refresh the protected fixture
before capture and synchronize the demo app again:

```sh
npm run shots:prepare -- --email=ryan.ewen+persistentdemo@gmail.com
npm run shots:render
npm run shots:check
npm run shots:sync
```

`shots:prepare` runs in the isolated development stack; the capture and render steps
between commands are documented in the workflow. `shots:sync` replaces the local
upload directory only. Publish the listing separately when requested.

### Video

`graphics/video/` holds screen recordings, all 960x2142, captured on the demo
account so no real medication data appears.

**Marketing** (optional, for the promo slot):

- `swipe-away-comes-back.mp4` (16s) — swiping the notification away; it re-posts itself.
- `two-step-done.mp4` (16s) — Done arms "Confirm done" / "Not yet"; confirming clears the card.

**Permission declarations** (required — Play asks for a demonstration video for
each of these; see `play-readiness.md` §5):

| File | Declaration | Shows |
| --- | --- | --- |
| `permission-foreground-service.mp4` (36s) | Foreground Service | Alarm rings, app backgrounded, keeps ringing via the service, ongoing notification in the shade |
| `permission-full-screen-intent.mp4` (42s) | Full-screen intent | Device locked, alarm fires, full-screen surface over the lock screen |
| `permission-exact-alarm.mp4` (18s) | Exact alarms | Reminder scheduled for a set minute, firing exactly at it |

`permission-exact-alarm-frame.png` is a still from that last recording showing the
surface at the scheduled minute, if a reviewer wants a static reference.

**Every video slot in Play takes a YouTube URL, not a file upload.** Put these up
as unlisted and paste the links — the `.mp4`s here are source, not listing assets.

### Reproducing

Sign in as the demo account (`ryan.ewen+persistentdemo@gmail.com`), then note that
a repeating schedule only materializes *forward* from now — to get already-passed
firing times, create the reminder as `once` with the past times (the server
back-fills within `MATERIALIZE_WINDOW_MS`, 48h), let both fire, then edit it to
`daily`. The fired occurrences survive that edit by design
(`docs/notification-behavior.md` §6), so the card shows believable times of day
instead of firings a couple of minutes apart.
