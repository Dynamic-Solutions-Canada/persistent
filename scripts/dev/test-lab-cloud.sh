#!/usr/bin/env bash
# Run the pinned official Cloud CLI in Docker; credentials stay in an ignored local directory.
set -euo pipefail
task_root=$(cd "$(dirname "$0")/../.." && pwd)
task_config="$task_root/.secrets/test-lab-gcloud"
mkdir -p "$task_config"
chmod 700 "$task_config"
task_flags=()
if [[ -t 0 && -t 1 ]]; then task_flags+=(-it); fi
exec docker run --rm "${task_flags[@]}" --user "$(id -u):$(id -g)" \
  --env CLOUDSDK_CONFIG=/gcloud-config \
  --volume "$task_config:/gcloud-config" --volume "$task_root:/workspace" \
  --workdir /workspace gcr.io/google.com/cloudsdktool/google-cloud-cli:588.0.0-stable \
  gcloud "$@"
