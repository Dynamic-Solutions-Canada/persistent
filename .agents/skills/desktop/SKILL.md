---
name: desktop
description: Build, verify, package or install this repo's Windows desktop app from WSL through the shared Windows build bridge. Use for local desktop development. Do not use for releases or Store publishing.
---

Goal: build or install the working tree's Windows app through the shared bridge, and report what was actually observed.

The bridge, its commands, the local build VM and its rules are documented once in the [shared Windows build guide](https://github.com/Dynamic-Solutions-Canada/windows-build-tools#readme). Read it first; this skill adds only what is specific to Persistent.

1. Pick the root npm command for the request: `npm run verify:desktop` (Debug compile, including XAML and code-behind), `npm run package:desktop:dev` (signed dev package), `npm run package:desktop` (unsigned Store package), or `npm run install:desktop` (build, update in place and launch). "Rebuild and try it" means `install:desktop`.
2. Use `npm run install:desktop -- --store-identity` only when a Release sideload over the Store installation is authorised. It keeps the Store identity and the app's data, needs the matching publisher certificate, and publishes nothing. Leave that Release update installed; remove separate dev test packages afterwards and leave no Debug installation behind.
3. Let the bridge own staging, dev version numbers, signing, the in-place update, launch and cleanup. Do not repeat those steps by hand, edit tracked versions for a dev build, uninstall, or change the publisher to get past an error.
4. Persistent's launcher (`scripts/windows-build`) first prepares the desktop localization inputs from the canonical catalogs. Translation changes belong in those catalogs ([localization](../../../docs/localization.md)), never in the prepared copies.
5. A worktree created without submodules needs `git submodule update --init --recursive` before a Windows build, because the desktop app imports the promo submodule.

Report: the command run, the resulting package version and path, and whether the app was installed and seen running. Say plainly when only a compile or a dry run was observed.
