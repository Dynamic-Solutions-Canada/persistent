#!/usr/bin/env bash
# Run host tooling with this checkout's pinned runtime, including non-interactive
# Paseo hooks. Reuse an installed nvm runtime; never install or change its default.
set -eo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
node_version="$(cat "$repo_root/.nvmrc")"

unset npm_config_prefix NPM_CONFIG_PREFIX

if [[ "$(node --version 2>/dev/null)" != "v$node_version" ]]; then
  nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [[ ! -s "$nvm_script" ]]; then
    echo "[runtime] Node $node_version is required. Use the development container or install it with nvm first." >&2
    exit 1
  fi

  # nvm is a shell function, so non-interactive shells must load it explicitly.
  source "$nvm_script" --no-use
  nvm use --silent "$node_version" || exit 1
fi

npm_version="$(node -p "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).engines.npm" "$repo_root/package.json")"
if [[ "$(npm --version)" != "$npm_version" ]]; then
  echo "[runtime] npm $npm_version is required for Node $node_version. Restore its bundled npm before retrying." >&2
  exit 1
fi

# An outer npm run may have used the host runtime. Devkit fingerprints installs
# using this identity, so let it detect the selected runtime instead of Node 24.
unset npm_config_user_agent npm_node_execpath npm_execpath
exec "$@"
