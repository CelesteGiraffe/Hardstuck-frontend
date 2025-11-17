#!/usr/bin/env bash
# Copies built plugin runtime files into the bakkes_plugin/deploy/ folder.
# Usage: ./scripts/deploy.sh [source_dir] [pattern1 pattern2 ...]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_CANDIDATES=(
  "build/Release"
  "build/x64/Release"
  "Release"
  "x64/Release"
  "build"
)

SRC_OVERRIDE=""
if [ $# -gt 0 ] && [ -d "$1" ]; then
  SRC_OVERRIDE="$1"
  shift
fi

if [ -n "$SRC_OVERRIDE" ]; then
  candidates=("$SRC_OVERRIDE" "${DEFAULT_CANDIDATES[@]}")
else
  candidates=("${DEFAULT_CANDIDATES[@]}")
fi

found=""
for c in "${candidates[@]}"; do
  p="$PLUGIN_ROOT/$c"
  if [ -d "$p" ]; then
    found="$p"
    break
  fi
done

if [ -z "$found" ]; then
  echo "No build output folder found. Checked: ${candidates[*]}" >&2
  exit 2
fi

deploy_dir="$PLUGIN_ROOT/deploy"
mkdir -p "$deploy_dir"

patterns=("*.dll" "*.so" "*.dylib" "*.ini" "*.json")
if [ $# -gt 0 ]; then
  patterns=("$@")
fi

copied=0
names=""
for pat in "${patterns[@]}"; do
  shopt -s nullglob
  for f in "$found"/$pat; do
    if [ -f "$f" ]; then
      cp -f "$f" "$deploy_dir/"
      base=$(basename "$f")
      names="$names $base"
      echo "Copied: $f -> $deploy_dir/"
      copied=$((copied+1))
    fi
  done
  shopt -u nullglob
done

# Also copy pluginconfig.json from the plugin root if present and not already copied
if [ -f "$PLUGIN_ROOT/pluginconfig.json" ]; then
  if echo "$names" | grep -w -q "pluginconfig.json"; then
    echo "pluginconfig.json already copied from build output; skipping additional copy."
  else
    cp -f "$PLUGIN_ROOT/pluginconfig.json" "$deploy_dir/"
    echo "Copied: $PLUGIN_ROOT/pluginconfig.json -> $deploy_dir/"
    copied=$((copied+1))
  fi
fi

if [ $copied -eq 0 ]; then
  echo "No files matched the given patterns in $found and no pluginconfig.json was found." >&2
  exit 1
fi

echo "Done. Copied $copied file(s) into $deploy_dir"
exit 0
