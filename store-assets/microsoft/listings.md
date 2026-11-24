# Microsoft Store localized listing text

`listings.json` is the Windows-specific draft text source for nine listing identities: `en-US`, `en-CA`, `es-ES`, `fr-FR`, `fr-CA`, `de-DE`, `zh-CN`, `pt-BR` and `ja-JP`. It follows the Play metadata's `schemaVersion: 1` and `locales` shape. Seven records contain wording; `en-CA` uses only `{ "copyFrom": "en-US" }` and `fr-CA` uses only `{ "copyFrom": "fr-FR" }`. Resolve these copies when exporting, keeping both Canadian listing identities.

Each wording record contains `title` (always `Persistent`), `fullDescription`, `shortDescription`, `features`, `keywords`, `heroHeadline`, `heroSubline` and `screenshotCaptions`. These are semantic source fields, not Microsoft CSV field names or IDs. Release notes are not listing text: they are per version, in `release-notes/desktop-<version>[.<identity>].md`, and `store-publish` sends them to every listing locale (LIST-10).

| Text                | Limit                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Full description    | 4,000 characters                                                                                |
| Short description   | 270 characters                                                                                  |
| Features            | Up to 20, each up to 200 characters                                                             |
| Keywords            | Up to 7, each up to 40 characters, at most 21 words combined                                    |
| Hero headline       | Fits the generated first screenshot; `devkit-store-hero` names a locale whose headline does not |
| Screenshot captions | Exactly one per desktop image (the hero and four captures), in order, each up to 200 characters |

The text describes a Windows tray companion and optional returning notifications while signed in, with the tray process running and the PC awake. It distinguishes Android's previously scheduled exact, offline, closed-app alarms. The Windows 11 widget is described as read-only and limited to supported systems. Language, regional dates, clock format, account time zone and email language stay separate; user-authored text and medicine details are preserved. The language-change audio/menu-reset tradeoff is included in every release-note wording. Privacy copy states no ads, tracking or third-party analytics SDK and discloses internal aggregate usage statistics, replacing the inaccurate blanket claim of no analytics.

The first image is the generated hero (D-123): its headline is the first sentence of each locale's short description, and its subline, also its caption, comes from the description's opening (view, snooze and confirm on the same account as the web and Android), so it claims nothing the listing does not. The en-US headline and subline are approved; the other locales' are draft translations awaiting native review, and the German headline breaks after `Windows-` because the compound does not fit the panel. The other captions describe the actual [four Windows captures](README.md), preserving Current, checklist reading view, synthetic vitamin editor and assigned-task progress order. Captions and descriptions disclose the English interface. This draft does not translate legal documents or constitute native-speaker review.

## CSV handoff

Merge this source into the actual Persistent Console export. Preserve every opaque `Field`/`ID`/`Type (Type)` cell, row order, separator row and unowned cell. Use the real export's locale columns and audited text rows; do not synthesize a CSV template or infer asset URLs. The `store-publish` workflow now owns each listing's screenshots (its hero, then the four captures), so the CSV's screenshot cells need no hand edits. Localize caption cells separately from image references. Preserve other assets, contact/legal fields, name ownership and unrelated metadata.

The coordinator owns the export, merge, Edge import and publication. Package version selection and Store validation are separate from text readiness. This source does not change country availability, package identities, prices, screenshots, policy declarations or legal URLs. Offline size/shape/alias checks and the copy review are not proof of a successful Console import or Store publication.
