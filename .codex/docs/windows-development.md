# Windows desktop workflow

From the WSL repository root, use the same commands across all four apps:

| Command | Result |
| --- | --- |
| `npm run build:desktop` | Signed ARM64 Release dev package |
| `npm run verify:desktop` | Full Windows Debug compile |
| `npm run install:desktop` | Build, update in place, launch |
| `npm run install:desktop -- --store-identity` | Signed Release bundle that updates the Store installation |
| `npm run install:desktop -- --skip-build` | Reinstall the latest successful dev package |
| `npm run install:desktop -- --skip-build --dry-run` | Check the install without changing Windows |
| `npm run package:desktop` | Unsigned Store package |

Pass `-- --platform x64` for x64 or `-- --no-launch` when installing without
launching. The working tree is staged in a unique C: Windows TEMP directory,
cleaned after use. Logs and packages return to `.artifacts/windows-build/` in WSL.
Tracked release versions stay unchanged; dev revisions change only in staging.
Never uninstall to bypass an update error or silently replace a publisher.

Persistent's launcher prepares hash-verified localization inputs with Python 3 before calling the shared helper. The normal narrow desktop snapshot remains self-contained without npm or copying the rest of the repository. Generated inputs are ignored; translation changes belong in the [canonical catalogs](../../docs/localization.md), not the prepared copies.

MSIX packaging generates a root `resources.pri` after finalizing the Store or dev identity. It merges the completed host index with nine canonical manifest RESWs through an isolated input directory, leaving the standalone host PRI unchanged. The package primary map must retain all host resources, including embedded XAML, alongside the localized shell/widget metadata. The packaging script unpacks the finished MSIX and validates actual manifest references, all nine languages, English fallback, resource flags and every original host candidate. Detailed dumps and a structured report are written under `apps/desktop/artifacts/package-resources/<platform>/packaged` in staging; build logs carry the validation summary. Checking keys in the assembly PRI alone does not qualify manifest resource resolution or installed startup.

The explicit `--store-identity` mode preserves the Store identity and account
data, and requires a matching publisher certificate. It does not publish to the
Store. Release sideloads may remain installed; remove separate dev test packages
after verification and do not leave Debug installations behind.

The policy and implementation are shared, not copied per project. Read the
[shared build/install guide](../../../windows-build-tools/README.md), or open
`$WINDOWS_BUILD_TOOLS/README.md` when using a custom tools location. The launcher is
`scripts/windows-build` and the per-project manifest is `windows-build.json`.

`.codex/commands/build.md`, `install.md`, and `rebuild.md` are Codex task guides,
not automatically registered slash commands. Follow existing release workflows
for publishing, and leave changes uncommitted unless explicitly requested.

The repository skill `$desktop` supports the same build, verify and install
requests. Start a new Codex task to discover newly added repository skills.
