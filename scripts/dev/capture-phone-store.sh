#!/usr/bin/env bash
# Guided capture of the Play phone set in every Play listing locale, on the Pixel 5 test phone
# (192.168.2.205; never Ryan's own phone). For each locale it seeds the demo account with that
# locale's synthetic data, switches the phone's system language, restarts the demo app so it follows
# it, then prompts for each scenario in store-assets/README.md ("Google Play") and saves the real
# screen with screencap into store-assets/raw/android/native/<locale>/. The phone's original system
# language is restored on exit, also after a failure or Ctrl+C. Untested: written before the
# localized capture session, so its first run is supervised.
#
# Usage: scripts/dev/capture-phone-store.sh [locale ...]
#   With no locales, every Play listing locale with its own record (en-CA and fr-CA upload
#   en-US's and fr-FR's sets, so they are never captured).
#
# Environment:
#   SHOTS_NODE_CONTAINER  required: the dev stack's Node container, which runs shots:prepare
#   ADB                   default adb: an adb that holds the phone's existing pairing key
#
# How the language is switched: the Pixel 5 runs Android 17 (API 37), whose shell has
# `cmd locale set-device-locale <tag>` and `get-device-locale`, so no helper app is installed.
# Verified on 2026-11-27: ja-JP and zh-Hans-CN applied and read back, and en-US restored
# `system_locales` to exactly en-US. The phone accepts zh-Hans-CN, not zh-CN, so a listing
# locale is mapped to the tag the phone lists before switching. Switching re-posts Android's
# debugging notifications as heads-up banners: wait for them to clear before capturing.
# Afterwards, convert each capture to RGB with scripts/dev/convert-store-capture.ps1 (README)
# before rendering. Nothing here changes display timeout, lock or other persistent settings; the
# shared keepalive helper keeps the unlocked phone awake and stops with this script.
set -euo pipefail

repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"

: "${SHOTS_NODE_CONTAINER:?Set SHOTS_NODE_CONTAINER to the dev stack Node container (docker ps).}"
adb="${ADB:-adb}"
test_phone=192.168.2.205
demo_package=ca.persistent.app
device_helper="$HOME/.claude/bin/android-device.py"

# The locales to capture: the arguments, or every Play listing locale with its own record.
if (($# > 0)); then
    locales=("$@")
else
    mapfile -t locales < <(node --import tsx -e "
        import { captureLocales } from './scripts/dev/store-demo-text.ts'
        console.log(captureLocales('store-assets/play/listings.json').join('\n'))")
fi

# 1. Connect to the test phone only. The helper finds the rotating wireless-debugging port.
serial="$(python3 "$device_helper" --adb "$adb" connect "$test_phone" | grep -oE "^${test_phone//./\\.}:[0-9]+" | tail -n 1 || true)"
if [[ -z "$serial" ]]; then
    echo "capture-phone-store: could not connect to the test phone at $test_phone" >&2
    exit 1
fi
device() { "$adb" -s "$serial" "$@"; }
echo "Test phone: $serial"

# 2. The phone must offer the shell locale command (Android 17 and newer).
if ! device shell cmd locale help | grep -q set-device-locale; then
    echo "capture-phone-store: this phone has no 'cmd locale set-device-locale'; switch its language another way." >&2
    exit 1
fi

# The phone's current system locale, as a BCP 47 tag such as en-US.
system_locale() {
    device shell cmd locale get-device-locale | tr -d '\r'
}

# The phone's tag for a listing locale: it lists Chinese with its script (zh-Hans-CN).
device_tag() {
    case "$1" in
        zh-CN) printf 'zh-Hans-CN\n' ;;
        *) printf '%s\n' "$1" ;;
    esac
}

# Set the system locale to $1 (language-REGION) and confirm it took effect.
set_system_locale() {
    local locale="$1" tag now
    tag="$(device_tag "$locale")"
    device shell cmd locale set-device-locale "$tag" >/dev/null
    sleep 3
    now="$(system_locale)"
    if [[ "$now" != "$tag" ]]; then
        echo "capture-phone-store: the phone reports $now after switching to $tag" >&2
        return 1
    fi
}

original_locale="$(system_locale)"
if [[ ! "$original_locale" =~ ^[a-z]{2,3}(-[A-Z][a-z]{3})?-[A-Z]{2}$ ]]; then
    echo "capture-phone-store: cannot read the phone's current locale ($original_locale), so it could not be restored; stopping before any change." >&2
    exit 1
fi
echo "Original system locale: $original_locale (restored on exit)"

# 3. Keep the unlocked phone awake for the session; the helper stops when this script exits.
python3 "$device_helper" --adb "$adb" --duration 7200 --parent-pid $$ keepalive "$test_phone" &
keepalive=$!

restore() {
    set +e
    echo "Restoring the system locale to $original_locale"
    set_system_locale "$original_locale" || echo "capture-phone-store: RESTORE FAILED; set $original_locale in Settings > System > Languages." >&2
    device shell am force-stop "$demo_package"
    kill "$keepalive" 2>/dev/null
}
trap restore EXIT

# One locale's sample strings, for the prompts (the seed writes the same text).
sample() {
    node -e "
        const text = JSON.parse(require('node:fs').readFileSync('store-assets/demo-text.json', 'utf8')).locales[process.argv[1]]
        console.log(process.argv[2].split('.').reduce((value, key) => value[key], text))
    " "$1" "$2"
}

# Prompt for one scenario, then save the actual screen.
shoot() {
    local locale="$1" name="$2" instruction="$3"
    read -r -p "[$locale] $name: $instruction Press Enter to capture. " _
    device exec-out screencap -p >"store-assets/raw/android/native/$locale/$name.png"
    echo "  saved raw/android/native/$locale/$name.png (RGBA; convert before rendering)"
}

for locale in "${locales[@]}"; do
    echo "== $locale"
    mkdir -p "store-assets/raw/android/native/$locale"

    # Seed, switch the system language, and restart the demo app so it follows the device.
    docker exec -w /workspace "$SHOTS_NODE_CONTAINER" \
        npm run shots:prepare -- --email=demo@example.test "--locale=$locale"
    set_system_locale "$locale"
    device shell am force-stop "$demo_package"
    device shell monkey -p "$demo_package" -c android.intent.category.LAUNCHER 1 >/dev/null

    shoot "$locale" 00-current-dark "Current, Enjoy Dark, Settings language on the system setting."
    shoot "$locale" 01-notification-shade-dark "Expand the Persistent group and \"$(sample "$locale" plants.title)\" until Done and Snooze show; press neither."
    shoot "$locale" 02-alarm-dark "Escalated alarm for a new \"$(sample "$locale" alarm.title)\" reminder (body \"$(sample "$locale" alarm.details)\"), Done, Snooze and De-escalate visible. Never press Done; delete only that reminder afterwards."
    shoot "$locale" 03-checklist-dark "Open \"$(sample "$locale" outTheDoor.title)\" in its reading dialog; toggle nothing."
    shoot "$locale" 04-medication-dark "Edit \"$(sample "$locale" vitamin.title)\" showing the dose; do not save."
    shoot "$locale" 05-sharing-dark "New draft \"$(sample "$locale" shareDraft.title)\", Share open with alex@example.test staged; send nothing."
    shoot "$locale" 06-notes-dark "Notes, showing \"$(sample "$locale" trip.title)\"."
    shoot "$locale" 07-assigned-dark "Assigned by me, showing \"$(sample "$locale" parcel.title)\" completed."
done

echo "Captured: ${locales[*]}. Next: convert to RGB, npm run shots:render, npm run shots:export, npm run shots:check (README)."
