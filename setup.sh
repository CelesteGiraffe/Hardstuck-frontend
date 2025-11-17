#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
echo "Repository root: $ROOT"

NO_FETCH_IMGUI=0
NO_NPM=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-fetch-imgui) NO_FETCH_IMGUI=1; shift;;
    --no-npm) NO_NPM=1; shift;;
    -h|--help) echo "Usage: setup.sh [--no-fetch-imgui] [--no-npm]"; exit 0;;
    *) echo "Unknown option: $1"; exit 1;;
  esac
done

if [[ $NO_FETCH_IMGUI -eq 0 ]]; then
  IMGUI_DIR="$ROOT/bakkes_plugin/third_party/imgui"
  if [[ ! -d "$IMGUI_DIR" ]]; then
    echo "Cloning Dear ImGui into $IMGUI_DIR..."
    git clone --depth 1 https://github.com/ocornut/imgui.git "$IMGUI_DIR"
  else
    echo "ImGui already exists at $IMGUI_DIR"
  fi
fi

if [[ $NO_NPM -eq 0 ]]; then
  if [[ -d "$ROOT/ui" ]]; then
    echo "Running npm install in ui/"
    (cd "$ROOT/ui" && npm install)
  fi
  if [[ -d "$ROOT/api" ]]; then
    echo "Running npm install in api/"
    (cd "$ROOT/api" && npm install)
  fi
fi

echo "Configuring and building plugin (bakkes_plugin)..."
cd "$ROOT/bakkes_plugin"
cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
cmake --build build --config Release --target RLTrainingJournalPlugin

echo "Setup complete. Check bakkes_plugin/deploy/ for runtime artifacts."
