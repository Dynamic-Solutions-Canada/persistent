#!/usr/bin/env bash
# Capture the Microsoft Store tray-flyout set in every listing locale, on the windows-dev test VM
# (store-assets/README.md, "Microsoft Store"). For each locale: seed the demo account with that
# locale's synthetic data, check (or switch) the guest's display language, run
# capture-desktop-store.ps1 in the guest's desktop session, and copy the four captures and their
# sidecars into store-assets/raw/microsoft/<locale>/. Run on the VM at 200% in en-US and ja-JP
# (November 26, 2026).
#
# When: the seed places each firing at its schedule's most recent time (8:00, 8:15 and 9:00 a.m.
# Toronto), so the cards read "Today" only when the capture runs on a weekday after 9:00 a.m.;
# earlier they read "Yesterday", and at weekends the school-day reminder moves to Friday. The
# script checks the guest's clock and stops outside 9:05 a.m. to 5:55 p.m. on a weekday.
#
# Usage: scripts/dev/capture-desktop-store.sh [locale ...]
#   With no locales, every Microsoft listing locale with its own record (en-CA and fr-CA reuse
#   en-US's and fr-FR's captures, so they are never captured).
#
# Environment:
#   SHOTS_NODE_CONTAINER   required: the dev stack's Node container, which runs shots:prepare
#   DESKTOP_LANGUAGE_SWITCH optional: a command run as `$DESKTOP_LANGUAGE_SWITCH <locale>` when the
#                          guest is in another language. Switching takes a sign-in (a cold cycle
#                          of the VM, about 80 s), so the capture owner provides it; without it the
#                          script stops and names the language it needs.
#   WEBVIEW2_DEBUG_PORT    default 9222: the port the guest's WebView2 debug policy opens
#   CAPTURE_SCALE          default 200: the display scale every capture must report
#   WINDOWS_BUILD_TOOLS    default /development/windows-build-tools
#
# Preconditions are the README's: a throwaway -snapshot session, the Debug dev package installed
# and pointed at the local origin, signed in to the demo account only, the WebView2 debug policy,
# screenshot-desktop.ps1 -Mode Prepare done, at 200% display scale. A language switch takes a
# sign-in or a cold cycle, and cold-cycling a -snapshot guest discards all of that, so the
# switch command (or the capture owner) must re-establish these preconditions for each locale.
# This script changes nothing else in the guest.
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

: "${SHOTS_NODE_CONTAINER:?Set SHOTS_NODE_CONTAINER to the dev stack Node container (docker ps).}"
debug_port="${WEBVIEW2_DEBUG_PORT:-9222}"
scale="${CAPTURE_SCALE:-200}"
tools="${WINDOWS_BUILD_TOOLS:-/development/windows-build-tools}"

# shellcheck source=/dev/null
source "$tools/vm/app-test/app-test.sh"
app_test_use win11

# The locales to capture: the arguments, or every listing locale with its own record.
if (($# > 0)); then
    locales=("$@")
else
    mapfile -t locales < <(node --import tsx -e "
        import { captureLocales } from './scripts/dev/store-demo-text.ts'
        console.log(captureLocales('store-assets/microsoft/listings.json').join('\n'))")
fi

# The guest's current display language, as Windows reports its first user language.
guest_language() {
    app_test_ssh 'powershell -NoProfile -Command "(Get-WinUserLanguageList)[0].LanguageTag"' | tr -d '\r'
}

# Whether Windows tag $1 is listing locale $2. Windows reports some tags without the region or
# with a script ("ja" for ja-JP, "zh-Hans-CN" for zh-CN): the language must match, and the
# region too when the tag names one.
same_language() {
    local tag="$1" locale="$2" region
    [[ "${tag%%-*}" == "${locale%%-*}" ]] || return 1
    region="$(tr '-' '\n' <<<"${tag#*-}" | grep -xE '[A-Z]{2}' || true)"
    [[ "$tag" != *-* || -z "$region" || "$region" == "${locale##*-}" ]]
}

# Make the guest's display language $1, or stop and say which one is needed.
ensure_language() {
    local locale="$1" current
    current="$(guest_language)"
    if same_language "$current" "$locale"; then
        return 0
    fi
    if [[ -z "${DESKTOP_LANGUAGE_SWITCH:-}" ]]; then
        echo "capture-desktop-store: the guest is in $current; switch it to $locale (or set DESKTOP_LANGUAGE_SWITCH) and rerun with: $locale" >&2
        exit 1
    fi
    $DESKTOP_LANGUAGE_SWITCH "$locale"
    current="$(guest_language)"
    if ! same_language "$current" "$locale"; then
        echo "capture-desktop-store: the language switch left the guest in $current, not $locale" >&2
        exit 1
    fi
}

# The guest script's inputs for one locale, from the fixture shots:prepare just wrote.
write_inputs() {
    local locale="$1" file="$2"
    node -e "
        const fs = require('node:fs')
        const [locale, port, scale, file] = process.argv.slice(1)
        const fixture = JSON.parse(fs.readFileSync('store-assets/fixture.json', 'utf8'))
        const text = JSON.parse(fs.readFileSync('store-assets/demo-text.json', 'utf8')).locales[locale]
        if (fixture.locale !== locale) throw new Error('fixture.json is for ' + fixture.locale + ', not ' + locale)
        // Ids by the locale's own titles, since the seed writes them in that language.
        const id = (title) => {
            const found = fixture.reminders.find((reminder) => reminder.title === title)
            if (!found) throw new Error('No ' + title + ' in fixture.json')
            return found.id
        }
        fs.writeFileSync(file, JSON.stringify({
            locale,
            debugPort: Number(port),
            scale: Number(scale),
            hour12: locale === 'en-US',
            reminders: { outTheDoor: id(text.outTheDoor.title), vitamin: id(text.vitamin.title) },
        }))
    " "$locale" "$debug_port" "$scale" "$file"
}

# Stop unless the guest's clock (Toronto time, as the seed's) is a weekday between 9:05 a.m. and
# 5:55 p.m., the hours in which every seeded firing is today's (see "When" above).
check_capture_time() {
    local now day hours mins minutes
    now="$(app_test_ssh "powershell -NoProfile -Command \"(Get-Date).ToString('yyyy-MM-dd HH mm')\"" | tr -d '\r')"
    read -r day hours mins <<<"$(date -d "$(cut -d' ' -f1 <<<"$now")" +%u) $(cut -d' ' -f2- <<<"$now")"
    minutes=$((10#$hours * 60 + 10#$mins))
    if ((day > 5 || minutes < 9 * 60 + 5 || minutes > 17 * 60 + 55)); then
        echo "capture-desktop-store: the guest's clock reads $now; capture on a weekday between 9:05 a.m. and 5:55 p.m., or the reminders read Yesterday" >&2
        exit 1
    fi
}

inputs="$(mktemp --suffix=.json)"
trap 'rm -f "$inputs"' EXIT

app_test_put "$tools/vm/app-test/ui-lib.ps1"
app_test_put scripts/dev/capture-desktop-store.ps1

for locale in "${locales[@]}"; do
    echo "== $locale"

    check_capture_time

    # Seed first: the guest's flyout shows whatever the account holds when it reloads.
    docker exec -w /workspace "$SHOTS_NODE_CONTAINER" \
        npm run shots:prepare -- --email=demo@example.test "--locale=$locale"
    ensure_language "$locale"

    write_inputs "$locale" "$inputs"
    app_test_put "$inputs" capture-inputs.json
    app_test_ui 'C:\apptest\capture-desktop-store.ps1'

    # Copy the four captures and sidecars into the locale's raw folder.
    target="store-assets/raw/microsoft/$locale"
    mkdir -p "$target"
    for name in 01-current-dark 02-checklist-dark 03-medication-dark 04-assigned-dark; do
        app_test_get "out/$locale/$name.png" "$target/"
        app_test_get "out/$locale/$name.json" "$target/"
    done
done

echo "Captured: ${locales[*]}. Next: npm run shots:render, npm run hero, then the checks (README)."
