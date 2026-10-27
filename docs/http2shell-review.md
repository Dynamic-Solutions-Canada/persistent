# HTTP2Shell runtime review

Reviewed October 26, 2026 against canonical `Dynamic-Solutions-Canada/persistent` main at `f8b4519d3c5295fc8353dc3961e795b3af3391a1`, freshly fetched and identical to this task's clean starting branch. This report records the source review and pre-deployment evidence; deployment status is verified separately.

## Runtime decisions

| Surface | Evidence | Change or remaining gate |
| --- | --- | --- |
| API, web builds and development | Node 20.20.2 is end of life. Express 5.2.1/body-parser 2.3.0 accepts Brotli JSON before session attachment in `apps/api/src/app.ts`. This establishes source reachability, conditional on deployment and upstream proxy behavior. | Pin Node 22.23.4 and its bundled npm 10.9.9 across root engines/lock, `.nvmrc`, production/development images and all Node CI selectors. Preserve compressed request support. |
| Linux build tools | Build CI used Node 22.22.3, while the standalone engine admitted older releases. | Use the same exact patched Node 22.23.4 for standalone tooling and lock metadata. This does not replace Electron's embedded Node. |
| Linux application | Electron 44.7.0 embeds Node 24.21.0. Official latest stable 45.0.0 and maintained 44.9.3 release metadata and source DEPS still select Node 24.22.0. No explicit stable decoder backport was established. The upstream 46.0.0-alpha.2 prerelease selects patched Node 24.22.1. | Leave the stable Electron dependency unchanged. A verified fixed stable Electron release/backport, followed by packaging and native checks, remains required. Adopting an alpha would change the product release channel and is outside this server deployment. No application exploit was tested. |
| Windows application and widget | Published `desktop-v0.6.1` x64 and ARM64 build logs use SDK 10.0.402/runtime 10.0.13. Packaging scripts request self-contained builds. Source, including the exact promo submodule revision, has no direct Brotli or enabled automatic-decompression path. The shipped ZIP runtime was not inspected. | Set SDK 10.0.403 as the stable .NET 10 floor, with later feature bands/patches eligible. Check actual SDK-resolved self-contained core runtime packs against minimum 10.0.14. This is runtime remediation/defense in depth; reachable Windows exploitation remains unconfirmed. |

The desktop `global.json` travels with the existing `apps/desktop` staging boundary. Both Windows workflows install from it; the development SDK installer bootstraps the same version. Workflow working directories are `apps/desktop`. The shared Windows bridge starts at the staged source root and addresses the project explicitly. Headless MSBuild evaluation showed that this root invocation can bypass the nested global.json, so the common project target also rejects SDK versions below 10.0.403 before framework resolution. Runtime selection and architecture remain SDK-owned. The common `Directory.Build.targets` guard rejects an older explicit runtime override without fixing all later builds to one patch version.

## Verification

Checks ran headlessly under the shared host validation lock with one CPU, 2 GiB container memory and a 1536 MiB Node heap. No services, Windows execution, host installs, deployment, release or exploit attempt is included.

- `npm run validate`: passed with 594 tests passing, two database tests skipped and zero failures. Lint has three existing React refresh warnings; typechecking and Prisma schema validation passed.
- `npm run build`: shared package, API, web production build and service-worker generation passed. Existing bundle-size warnings remain.
- `npm run build:linux`: standalone Linux typecheck and bundled build passed. No Electron executable was launched or packaged.
- `bash apps/desktop/tools/runtime-security/verify.sh`: passed with official SDK 10.0.403/MSBuild 18.9.15. Both tray and widget on x64/ARM64 resolve core runtime 10.0.14 and reject explicit 10.0.13. A later runtime resolution fixture and framework-dependent flow remain eligible. The repository-root invocation rejects an older SDK version property fixture. These are resolution checks, not Windows compilation or package inspection.
- Runtime/lock/workflow consistency, workflow YAML parsing, valid Brotli and gzip JSON requests, npm install dry-run, all 18 desktop XML files, shell syntax and `git diff --check` passed.

Node compatibility checks reused the cached project development image with the exact Node 22.23.4 executable and bundled npm 10.9.9 extracted from the cached official image and mounted read-only ahead of PATH. Host/executed binary hashes match. Git metadata and the Linux dependency cache were mounted read-only; 309 installed Linux package versions match the task lockfile. The source lockfile matches that cache's dependency graph apart from the intentional root engine metadata change. This establishes compatibility with the selected runtime and dependencies, not a rebuilt production image. The Node runtime reports Brotli 1.1.0; the security-release designation and patched Node source, rather than that library version label alone, establish the Node fix.

The focused .NET regression script is kept in the owning desktop tools directory. Logs, runtime identities and supplemental checks are retained under ignored `.artifacts/http2shell/`, especially `cached-validation.log`, `dotnet-final.log` and `runtime-packs/`. Earlier container failures are retained separately: slim-image prerequisites, missing linked Git metadata, process reaping limits and host disk exhaustion. The cached compatibility run used existing prerequisites, Docker init and no downloads or installs. The separate production image build performed a fresh npm install inside Docker. Synthetic old versions in `scripts/dev/project-node.test.ts` remain intentional selector fixtures; historical verification reports retain the versions actually tested.

## Remaining execution gates

The exact production Dockerfile passed a local pre-deployment build and image inspection. Development images still require rebuilding. A production rollout requires separate live runtime/health checks and confirmation that configuration and the database volume are preserved. A server deployment does not update published native packages. Windows requires real compile, package inspection for both app/widget runtime copies and installed startup checks before a separately authorized release. Linux needs a verified patched stable Electron target, rebuilt packages and desktop acceptance. Passing source, MSBuild resolution or Node tests cannot close those gates.

## Primary sources

- [Node October security advisory](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) and [Node 22.23.4 release](https://nodejs.org/en/blog/release/v22.23.4).
- [Bundled npm version in Node 22.23.4](https://github.com/nodejs/node/blob/v22.23.4/deps/npm/package.json) and [Node release support](https://nodejs.org/en/about/previous-releases).
- [Express body-parser decoding defaults](https://expressjs.com/en/resources/middleware/body-parser/).
- [Electron release composition](https://releases.electronjs.org/), [44.9.3 DEPS](https://github.com/electron/electron/blob/v44.9.3/DEPS) and [45.0.0 DEPS](https://github.com/electron/electron/blob/v45.0.0/DEPS).
- [.NET advisory and patched versions](https://github.com/dotnet/runtime/security/advisories/GHSA-p3jp-9v83-76w9) and [official .NET 10 release metadata](https://dotnetcli.blob.core.windows.net/dotnet/release-metadata/10.0/releases.json).
- [Electron prerelease DEPS showing Node 24.22.1](https://github.com/electron/electron/blob/v46.0.0-alpha.2/DEPS).
- [Published Windows release build](https://github.com/Dynamic-Solutions-Canada/persistent/actions/runs/39693005369), with x64 job `119543519559` and ARM64 job `119543519852`.
- [SDK discovery and roll-forward](https://learn.microsoft.com/en-us/dotnet/core/tools/global-json) and [SDK 10.0.403 framework resolution target](https://github.com/dotnet/sdk/blob/v10.0.403/src/Tasks/Microsoft.NET.Build.Tasks/targets/Microsoft.NET.Sdk.FrameworkReferenceResolution.targets).

## Commit review

Standards and requested scope were reviewed locally, including the full runtime/configuration diff and the focused MSBuild regression. No blocking implementation defect was found. Documentation drift in the Windows build contract was corrected: the Linux development container has a .NET SDK, while full WinUI builds and installed startup remain Windows checks. The evidence report was also clarified to distinguish fixed Electron prereleases from the stable release gate.

Documentation surfaces reviewed: root README, mobile README, all seven tracked AGENTS.md files, the reminder-model guide, auth/data-event/alarm/notification/desktop contracts, development/Linux build guidance, repository skills, .env.example, package scripts, both Dockerfiles, Compose deployment configuration and all changed CI workflows. Updated surfaces are the root/Linux runtime guidance, development guide, desktop/Linux architecture and this report. Root/mobile README, the other scoped guides and application contracts require no behavioral change. No environment variable, reminder rule, notification guarantee or release workflow is added.

Data-isolation review found no changed domain query, authenticated ownership check, request shape or persistence path. Logging review found no changed application failure path or secret logging. New build failures report the SDK or resolved runtime package/version through MSBuild errors; regression checks preserve nonzero exits and distinguish the intended guard failure from unrelated build errors.

## Pre-deployment image check

After the commit/deploy request, the exact production Dockerfile built successfully under a one-CPU, 2 GiB limit using the existing production host-network convention. The finished image was inspected offline for Node 22.23.4, npm 10.9.9, compiled API and web outputs, and absence of host `.env` and `.secrets` content. This closes the local production-image build gate; it does not establish deployment or native package acceptance. The image build, inspection and fresh mandatory validation are retained in `.artifacts/http2shell/review/`.
