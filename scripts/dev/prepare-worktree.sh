#!/usr/bin/env bash
# Prepare local dependencies and generated contracts without starting services.
# with-project-node.sh selects the runtime before Devkit launches npm ci.
set -eo pipefail

devkit prepare
npm run db:generate
npm run build --workspace @persistent/shared
