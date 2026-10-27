#!/usr/bin/env bash
# Verify SDK-selected runtime packs and the security floor without compiling or
# executing Windows applications. Requires the desktop SDK and promo submodule.
set -euo pipefail

desktop_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="${RUNTIME_SECURITY_OUTPUT_DIR:-$(mktemp -d)}"
if [[ -z "${RUNTIME_SECURITY_OUTPUT_DIR:-}" ]]; then
    trap 'rm -rf -- "$output_root"' EXIT
fi
mkdir -p "$output_root"
output_root="$(cd -- "$output_root" && pwd)"
cd "$desktop_root"

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1
export MSBUILDDISABLENODEREUSE=1

echo "Runtime security check SDK: $(dotnet --version)"
for app in Persistent.Desktop Persistent.Widget; do
    for platform in x64 ARM64; do
        rid=win-x64
        if [[ "$platform" == ARM64 ]]; then
            rid=win-arm64
        fi
        project="$app/$app.csproj"
        arguments=("$project" -nologo -m:1 -nodeReuse:false
            -target:ProcessFrameworkReferences -p:SelfContained=true
            "-p:Platform=$platform" "-p:RuntimeIdentifier=$rid"
            -p:EnableWindowsTargeting=true)
        result="$output_root/$app-$rid.json"
        dotnet msbuild "${arguments[@]}" -getItem:RuntimePack > "$result"
        python3 - "$result" "$rid" <<'PY'
import json, sys

packs = json.load(open(sys.argv[1]))['Items']['RuntimePack']
core = [pack for pack in packs if pack['FrameworkName'] == 'Microsoft.NETCore.App']
assert len(core) == 1, core
pack = core[0]
assert pack['RuntimeIdentifier'] == sys.argv[2], pack
assert tuple(map(int, pack['NuGetPackageVersion'].split('.'))) >= (10, 0, 14), pack
PY
        echo "$app $rid: SDK-selected patched runtime accepted"

        # An explicit old pack must fail because of the security guard, rather
        # than a restore, compile or unrelated platform error.
        old_result="$output_root/$app-$rid-old.log"
        if dotnet msbuild "${arguments[@]}" -p:RuntimeFrameworkVersion=10.0.13 > "$old_result" 2>&1; then
            echo 'Old explicit runtime unexpectedly accepted' >&2
            exit 1
        fi
        grep -q 'require .NET runtime 10.0.14 or newer' "$old_result"
        echo "$app $rid: old explicit runtime rejected"
    done
done

# Resolve a later override as a policy fixture only. No future pack is fetched.
dotnet msbuild Persistent.Widget/Persistent.Widget.csproj -nologo -m:1 -nodeReuse:false \
    -target:ProcessFrameworkReferences -p:SelfContained=true -p:Platform=x64 \
    -p:RuntimeIdentifier=win-x64 -p:EnableWindowsTargeting=true \
    -p:RuntimeFrameworkVersion=10.0.15 -getItem:RuntimePack > "$output_root/later-runtime-fixture.json"
echo 'Later runtime remains eligible (resolution fixture only)'

dotnet msbuild Persistent.Widget/Persistent.Widget.csproj -nologo -m:1 -nodeReuse:false \
    -target:ProcessFrameworkReferences -p:SelfContained=false -p:Platform=x64 \
    -p:RuntimeIdentifier=win-x64 -p:EnableWindowsTargeting=true \
    -getProperty:SelfContained > "$output_root/framework-dependent.log"
echo 'Framework-dependent resolution remains available'

# Override only the version property to test the SDK policy without installing
# an older SDK. Root invocations must enforce the same minimum as desktop cwd.
cd "$desktop_root/../.."
sdk_result="$output_root/old-sdk-policy.log"
if dotnet msbuild apps/desktop/Persistent.Widget/Persistent.Widget.csproj -nologo -m:1 -nodeReuse:false \
    -target:ProcessFrameworkReferences -p:EnableWindowsTargeting=true \
    -p:NETCoreSdkVersion=10.0.402 > "$sdk_result" 2>&1; then
    echo 'Old SDK policy fixture unexpectedly accepted' >&2
    exit 1
fi
grep -q 'require .NET SDK 10.0.403 or newer' "$sdk_result"
echo 'Root invocation rejects an older SDK version (policy fixture only)'
