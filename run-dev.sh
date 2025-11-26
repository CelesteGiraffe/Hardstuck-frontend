#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE=$(command -v node || true)
if [[ -z "$NODE" ]]; then
  echo "Node not found on PATH. Please install Node.js (https://nodejs.org/) and re-run this script."
  exit 1
fi

node "$ROOT/tools/dev-start.js" "$@"
