# Release notes

One set of files per version, committed before the version is tagged (REL-6). These files are the only source: every store's "What's new" and every GitHub Release takes its text from here, and CI never generates notes from commits or truncates them.

## File names

`[<lane>-]<version>[.<identity>].md`

| Lane    | File prefix | Goes to                                                 | Limit | Wordings                       |
| ------- | ----------- | ------------------------------------------------------- | ----- | ------------------------------ |
| Product | none        | The tagged production deploy                            | 500   | en-US; translations optional\* |
| Android | `android-`  | Google Play "What's new" (every locale), GitHub Release | 500   | all seven                      |
| Windows | `desktop-`  | Microsoft Store (every listing locale), GitHub Release  | 1,500 | all seven                      |
| Linux   | `linux-`    | GitHub Release                                          | 1,500 | en-US                          |

\* A version with any translation must have all of them. Releases before the Android lane existed (0.29.0 to 0.30.1) are product files and carry every wording because they went to Play.

The file without an identity is the `en-US` text. The others are `es-ES`, `fr-FR`, `de-DE`, `zh-CN`, `pt-BR` and `ja-JP`; `en-CA` and `fr-CA` reuse `en-US` and `fr-FR`, as the listings do.

## What goes in a file

User-facing text only, plain enough for a store's "What's new": no heading and no AI-disclosure line, both of which CI adds where they belong. Length is counted in characters as the stores count them (UTF-16 code units), so a Chinese or Japanese character counts once.

## Checks

`npm run check:notes` (part of `validate`) fails on a file name outside the grammar, a missing wording, an empty file, a heading or disclosure line, or text over its lane's limit. Each release workflow also refuses to start publishing when the tagged version's files are missing. The `release` skill drafts the notes from the changes since the last release, translates them, and shows every wording for approval before anything is committed.
