#!/usr/bin/env bash
set -euo pipefail

# Clickable macOS .command wrapper — same contents/behavior as setup-and-run.sh
# This file is intended for macOS users: double-clicking in Finder will open Terminal
# and run it. It calls the same logic as the POSIX script.

ROOT="$(cd "$(dirname "$0")" && pwd)"

export PATH="$PATH"

# When double-clicked, macOS sometimes starts at a different cwd. Ensure the script runs
# from the repository root to maintain parity with setup-and-run.sh behavior.
cd "$ROOT"

exec "./setup-and-run.sh" "$@"
