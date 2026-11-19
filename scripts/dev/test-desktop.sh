#!/usr/bin/env bash
# Run the Windows app's portable test harnesses (TEST-2) on any machine with the .NET SDK:
# the development container and CI have it; a bare host may not. Each harness gets a throwaway
# profile folder so it never reads or writes a real installation's preferences.
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
if ! command -v dotnet >/dev/null 2>&1; then
  echo "test:desktop needs the .NET SDK (apps/desktop/global.json); run it in the development container or install the SDK." >&2
  exit 1
fi

profile="$(mktemp -d)"
trap 'rm -rf "$profile"' EXIT

XDG_CONFIG_HOME="$profile" PERSISTENT_LOCALIZATION_TEST_PROFILE="$profile" \
  dotnet run --project "$repo_root/apps/desktop/tools/localization-tests" --configuration Release
