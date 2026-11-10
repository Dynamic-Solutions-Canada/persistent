#!/bin/bash
set -euo pipefail

# Attaches the running development container to the shared android-vm emulator, on demand.
#
# Run from WSL, not inside the container. The emulator is a separate Compose stack, so nothing
# in compose.dev.yml changes: the dev container joins the emulator's network at runtime, and the
# emulator's adb key is streamed into the container for that adb server only. Nothing is written
# to the android-home volume, so the phone's pairing key and saved endpoint are never touched.
#
# Lifecycle: the network connection lasts until the dev container is recreated. The key copy lives
# in the container's /tmp and is removed when the container is. Re-running is safe.
#
# Caveat: adb reads ADB_VENDOR_KEYS when its server starts, so this restarts the in-container adb
# server. A phone connected over wireless debugging drops and must be reconnected with
# `npm run android:connect`. Never run this alongside the Windows build VM (WSL memory is shared).

emulator_container="android-vm"
emulator_network="android-vm_default"
emulator_endpoint="android-vm:5556"
emulator_key_host="${HOME}/.local/share/android-vm/adb/adbkey"
key_in_container="/tmp/android-vm-adbkey"

# Prints the error and exits, so every failed precondition names the next step to take.
fail() {
    echo "android:emulator: $*" >&2
    exit 1
}

# Confirm the emulator is running before touching the dev container.
emulator_state="$(docker inspect -f '{{.State.Running}}' "$emulator_container" 2>/dev/null || true)"
if [ "$emulator_state" != "true" ]; then
    fail "the $emulator_container container is not running. Start the android-vm stack first (see its README), then re-run."
fi

[ -r "$emulator_key_host" ] || fail "the emulator adb key is missing or unreadable at $emulator_key_host."

# Find this checkout's dev container by its Compose labels, so worktrees each attach their own.
repo_root="$(git rev-parse --show-toplevel)"
node_container="$(docker ps -q \
    --filter label=com.docker.compose.service=node \
    --filter "label=com.docker.compose.project.working_dir=${repo_root}" | head -n1)"
[ -n "$node_container" ] || fail "no running development container for this checkout. Start it with npm run dev first."

# Join the emulator's network. Docker keeps the connection until the container is recreated.
attach_network() {
    local networks
    networks="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$node_container")"
    if [[ " $networks " == *" $emulator_network "* ]]; then
        return 0
    fi
    docker network connect "$emulator_network" "$node_container"
}

# Stream the key into the container's /tmp. Writing through `docker exec` keeps the file owned by
# the container user, so adb can read it without root; umask 077 keeps it private.
stage_key() {
    docker exec -i "$node_container" sh -c "umask 077 && cat > $key_in_container" < "$emulator_key_host"
}

# adb loads ADB_VENDOR_KEYS when its server starts, so restart the server with the variable set.
# The server then holds both the phone's key and the emulator's key.
connect_emulator() {
    # No running server is not an error here, and some adb versions exit nonzero for it.
    docker exec "$node_container" adb kill-server >/dev/null 2>&1 || true
    docker exec -e "ADB_VENDOR_KEYS=$key_in_container" "$node_container" adb connect "$emulator_endpoint"
}

# adb reports the device as `device` once auth completes; poll briefly for that state.
wait_for_device() {
    local attempt
    for attempt in 1 2 3 4 5 6 7 8; do
        if docker exec "$node_container" adb devices | grep -qE "^${emulator_endpoint}[[:space:]]+device\b"; then
            return 0
        fi
        sleep 1
    done
    return 1
}

attach_network
stage_key
connect_emulator

if wait_for_device; then
    echo "android:emulator: attached $emulator_endpoint. Target it with ANDROID_SERIAL=$emulator_endpoint when a phone is also connected."
    echo "android:emulator: a phone connected over wireless debugging was reset; reconnect it with npm run android:connect."
    exit 0
fi

docker exec "$node_container" adb devices >&2 || true
fail "$emulator_endpoint did not reach the device state. 'unauthorized' means the emulator key is not the one it trusts; 'offline' or missing means it is still booting or the network is not reachable."
