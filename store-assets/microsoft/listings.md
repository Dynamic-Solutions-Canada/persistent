# Microsoft Store localized listing text

`listings.json` is the Windows-specific draft text source for nine listing identities: `en-US`, `en-CA`, `es-ES`, `fr-FR`, `fr-CA`, `de-DE`, `zh-CN`, `pt-BR` and `ja-JP`. It follows the Play metadata's `schemaVersion: 1` and `locales` shape. Seven records contain wording; `en-CA` uses only `{ "copyFrom": "en-US" }` and `fr-CA` uses only `{ "copyFrom": "fr-FR" }`. Resolve these copies when exporting, keeping both Canadian listing identities.

Each wording record contains `title` (always `Persistent`), `fullDescription`, `shortDescription`, `features`, `releaseNotes`, `keywords` and `screenshotCaptions`. These are semantic source fields, not Microsoft CSV field names or IDs. The draft is not consumed by the existing screenshot/release-note publisher automatically.

| Text | Limit |
| --- | --- |
| Full description | 4,000 characters |
| Short description | 270 characters |
| Features | Up to 20, each up to 200 characters |
| Release notes | 1,500 characters |
| Keywords | Up to 7, each up to 40 characters, at most 21 words combined |
| Screenshot captions | Exactly the four existing ordered desktop images, each up to 200 characters |

The text describes a Windows tray companion and optional returning notifications while signed in, with the tray process running and the PC awake. It distinguishes Android's previously scheduled exact, offline, closed-app alarms. The Windows 11 widget is described as read-only and limited to supported systems. Language, regional dates, clock format, account time zone and email language stay separate; user-authored text and medicine details are preserved. The language-change audio/menu-reset tradeoff is included in every release-note wording. Privacy copy states no ads, tracking or third-party analytics SDK and discloses internal aggregate usage statistics, replacing the inaccurate blanket claim of no analytics.

All captions describe the actual [four Windows captures](README.md), preserving Current, checklist reading view, synthetic vitamin editor and assigned-task progress order. Captions and descriptions disclose the English interface. Screenshot image files, URLs and ordering are unchanged. This draft does not translate legal documents or constitute native-speaker review.

## CSV handoff

Merge this source into the actual Persistent Console export. Preserve every opaque `Field`/`ID`/`Type (Type)` cell, row order, separator row and unowned cell. Use the real export's locale columns and audited text rows; do not synthesize a CSV template or infer asset URLs. Keep the four existing English screenshot references, reusing those exact references for empty translated-listing slots as approved. Localize caption cells separately from image references. Preserve other assets, contact/legal fields, name ownership and unrelated metadata.

The coordinator owns the export, merge, Edge import and publication. Package version selection and Store validation are separate from text readiness. This source does not change country availability, package identities, prices, screenshots, policy declarations or legal URLs. Offline size/shape/alias checks and the copy review are not proof of a successful Console import or Store publication.
