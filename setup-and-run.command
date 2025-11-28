#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

show_info() { printf "\e[36m%s\e[0m\n" "$1"; }
show_success() { printf "\e[32m%s\e[0m\n" "$1"; }
show_error() { printf "\e[31m%s\e[0m\n" "$1"; }

NO_INSTALL=0
BUILD_PLUGIN=0
NO_BROWSER=0
DRY_RUN=0
UI_PORT=5173
API_PORT=4000
NO_FETCH_IMGUI=0

usage() {
	cat <<EOF
Usage: setup-and-run.command [options]

Options:
	--no-install         Skip npm installs (root/ui/api)
	--build-plugin       Build the native plugin (bakkes_plugin) using cmake
	--no-browser         Don't open the UI URL in a browser after start
	--dry-run            Show what would be done and exit
	--ui-port <port>     UI port to open in browser (default: 5173)
	--api-port <port>    API port (default: 4000)
	--no-fetch-imgui     Don't clone Dear ImGui into bakkes_plugin/third_party/imgui
	-h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--no-install) NO_INSTALL=1; shift;;
		--build-plugin) BUILD_PLUGIN=1; shift;;
		--no-browser) NO_BROWSER=1; shift;;
		--dry-run) DRY_RUN=1; shift;;
		--ui-port) UI_PORT="$2"; shift 2;;
		--api-port) API_PORT="$2"; shift 2;;
		--no-fetch-imgui) NO_FETCH_IMGUI=1; shift;;
		-h|--help) usage; exit 0;;
		*) show_error "Unknown option: $1"; usage; exit 1;;
	esac
done

show_info "Repository root: $ROOT"

# Check for node and npm
NODE=$(command -v node || true)
NPM=$(command -v npm || true)
if [[ -z "$NODE" || -z "$NPM" ]]; then
	show_error "Node.js and/or npm are not installed or not on PATH. Install Node.js (includes npm) from https://nodejs.org/"
	exit 1
fi

run_npm_install() {
	local folder="$1"
	local packageFile="$folder/package.json"
	if [[ ! -f "$packageFile" ]]; then
		show_info "No package.json in $folder - skipping npm install."
		return 0
	fi

	show_info "Running npm install in $folder..."
	if [[ $DRY_RUN -eq 1 ]]; then
		echo "DRY RUN: (cd $folder && npm install)"
		return 0
	fi

	pushd "$folder" > /dev/null
	if npm install; then
		show_success "Dependencies installed in: $folder"
		popd > /dev/null
		return 0
	else
		show_error "npm install failed in $folder"
		popd > /dev/null
		return 1
	fi
}

# By default install root, ui, api unless --no-install
if [[ $NO_INSTALL -eq 0 ]]; then
	ok=true
	ok=$(( ok & $? )) || true
	run_npm_install "$ROOT" || ok=false
	run_npm_install "$ROOT/ui" || ok=false
	run_npm_install "$ROOT/api" || ok=false

	if [[ $ok == false ]]; then
		show_error 'One or more installs failed. Not starting the server. Please fix errors above and run again.'
		exit 1
	fi
else
	show_info 'Skipping dependency install because --no-install was provided.'
fi

if [[ $DRY_RUN -eq 1 ]]; then
	show_info 'Dry run requested - not starting servers or opening a browser.'
	if [[ $BUILD_PLUGIN -eq 1 ]]; then
		show_info 'Would build native plugin (bakkes_plugin) with cmake.'
	fi
	show_info "Would run: npm start in $ROOT; open http://localhost:${UI_PORT} in browser (unless --no-browser)."
	exit 0
fi

if [[ $BUILD_PLUGIN -eq 1 ]]; then
	pluginDir="$ROOT/bakkes_plugin"
	if [[ -d "$pluginDir" ]]; then
		if [[ $NO_FETCH_IMGUI -eq 0 ]]; then
			imguiDir="$pluginDir/third_party/imgui"
			if [[ ! -d "$imguiDir" ]]; then
				show_info "Cloning Dear ImGui into $imguiDir..."
				git clone --depth 1 https://github.com/ocornut/imgui.git "$imguiDir"
			else
				show_info "ImGui already exists at $imguiDir"
			fi
		fi

		show_info 'Building native plugin (bakkes_plugin) with CMake...'
		pushd "$pluginDir" > /dev/null
		# configure and build
		cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
		cmake --build build --config Release --target RLTrainingJournalPlugin
		show_success 'Native plugin built successfully.'
		popd > /dev/null
	else
		show_info 'No bakkes_plugin folder found - skipping plugin build.'
	fi
fi

# Start the dev server using root npm start
show_info "Starting development servers (running 'npm start' from root)."
if [[ $DRY_RUN -eq 1 ]]; then
	show_info "DRY: Would start npm start in $ROOT"
else
	pushd "$ROOT" > /dev/null
	# Use nohup to let it keep running in background
	if command -v nohup > /dev/null 2>&1; then
		nohup npm start > "$ROOT/dev-server.log" 2>&1 &
		START_PID=$!
		show_info "Started 'npm start' (PID ${START_PID}). Logs -> $ROOT/dev-server.log"
	else
		npm start &
		START_PID=$!
		show_info "Started 'npm start' (PID ${START_PID})."
	fi
	popd > /dev/null
fi

# If requested, open the UI endpoint in the default browser
if [[ $NO_BROWSER -eq 0 ]]; then
	uiUrl="http://localhost:${UI_PORT}"
	# Give dev servers a short chance to bind
	sleep 3
	if [[ $DRY_RUN -eq 0 ]]; then
		show_info "Opening UI in browser at ${uiUrl}"
		# macOS uses open, Linux xdg-open
		if command -v open > /dev/null 2>&1; then
			open "$uiUrl" || show_error "Failed to open browser"
		elif command -v xdg-open > /dev/null 2>&1; then
			xdg-open "$uiUrl" || show_error "Failed to open browser"
		else
			show_error 'No method available to open a browser (open/xdg-open not found).'
		fi
	fi
else
	show_info 'Skipping opening browser because --no-browser was provided.'
fi

show_success 'Setup-and-run finished - dev servers are running (check dev-server.log or the console where npm start was launched).'
