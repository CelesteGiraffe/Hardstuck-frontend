# Development Setup

This file contains quick, copy-paste steps to get a developer environment ready for building and testing the BakkesMod plugin and the repo's other parts. It focuses on the minimal steps required to fetch Dear ImGui (uncommitted), configure the plugin, build it, and deploy the minimal runtime artifacts into `bakkes_plugin/deploy/`.

**Prerequisites**
- Git
- CMake (>= 3.18)
- Visual Studio with C++ workload (Windows) or appropriate C++ toolchain for your platform
- `pwsh` (PowerShell Core) or `powershell` on Windows
- Node.js + npm (if you want to build the `ui/` or `api/` parts)

If you use Windows + Visual Studio, open the "x64 Native Tools Command Prompt" or use PowerShell with the environment set.

**1) Clone repo (example)**
```pwsh
git clone https://github.com/CelesteGiraffe/RL-Trainer-2.git
cd RL-Trainer-2
```

**2) Install node deps (optional; for UI/API work)**
From the repo root:
```pwsh
cd ui
npm install
cd ..\api
npm install
cd ..
```

**3) Quick setup (recommended)**
There is a combined root-level setup-and-run script that installs npm deps (root, `ui/`, `api/` by default), optionally builds the native plugin, and can start the dev servers and open the UI in your browser.

PowerShell (Windows):
```pwsh
pwsh .\setup-and-run.ps1
```

The PowerShell script accepts these optional switches:
- `-NoInstall` : skip running `npm install` in root/ui/api
- `-BuildPlugin` : run CMake & build the native plugin in `bakkes_plugin`
- `-NoBrowser` : do not open the browser after starting servers
- `-DryRun` : validate environment and installs only; don't start servers or open browser

POSIX (macOS / Linux):
```bash
./setup-and-run.sh
```

The shell script accepts these optional flags (POSIX):
- `--no-install` : skip npm installs in root/ui/api
- `--build-plugin` : run CMake & build the native plugin in `bakkes_plugin`
- `--no-browser` : do not open the browser after starting servers
- `--dry-run` : validate environment and installs only; don't start servers or open browser
- `--ui-port <port>` : UI port to open in browser (default: 5173)
- `--api-port <port>` : API port (default: 4000)
- `--no-fetch-imgui` : don't clone Dear ImGui into `bakkes_plugin/third_party/imgui`

If you prefer to run steps manually, continue to the manual instructions below.

## Quick dev start (new)

To make starting both the API + UI dev servers easier on both macOS and Windows, this repo includes a small cross-platform helper at `tools/dev-start.js` and two simple wrappers:

-- macOS / Linux: `./run-dev.sh` (dev-server only) or `./setup-and-run.sh` for combined install+build+run
-- Windows PowerShell: use the all-in-one `setup-and-run.ps1` below or the platform wrappers in tools as appropriate

The helper will:
- check for Node and npm on PATH and show helpful install hints if missing
- run `npm install` in the repo root, and in `api/` and `ui/` if dependencies are missing
- start the dev servers (root `npm start` runs both API and UI)
- open the UI in your default browser (http://localhost:5173 by default)

From project root you can now run:

POSIX (macOS / Linux):
```bash
./run-dev.sh
```

Windows PowerShell / all-in-one:
```pwsh
pwsh ./setup-and-run.ps1
```

Or use the new npm script which does the same thing and is cross-platform:
```bash
npm run dev:start
```

This is intended as an ergonomic way to get both dev servers running and a browser opened — the root `start` script still uses `concurrently` like before.

**Manual: Fetch Dear ImGui (required for plugin build)**
The repository does not commit Dear ImGui. If you don't use the root setup script, clone it into `bakkes_plugin/third_party/imgui`.

PowerShell (manual):
```pwsh
pwsh .\bakkes_plugin\scripts\fetch_imgui.ps1
```

Manual git clone (PowerShell or bash):
```pwsh
git clone --depth 1 https://github.com/ocornut/imgui.git bakkes_plugin/third_party/imgui
```

After running this (manual or scripted), you should have files such as `imgui.h`, `imgui.cpp`, `imgui_draw.cpp`, and `imgui_widgets.cpp` under `bakkes_plugin/third_party/imgui`.

**4) Configure the plugin with CMake**
From the `bakkes_plugin` directory:

PowerShell / Windows example:
```pwsh
Set-Location -LiteralPath .\bakkes_plugin
cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
```

macOS/Linux example:
```bash
cd bakkes_plugin
cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
```

Notes:
- `RTJ_REQUIRE_IMGUI` is ON by default; if ImGui is not present CMake will stop with instructions.
- If you have a local BakkesMod SDK installed and want to use it, set the `BAKKESMODSDK` environment variable to the SDK root before running `cmake`.

**5) Build the plugin**
Windows / Powershell (Visual Studio generator):
```pwsh
cmake --build build --config Release --target RLTrainingJournalPlugin
```

macOS / Linux (or multi-config generators):
```bash
cmake --build build --config Release --target RLTrainingJournalPlugin
```

When the build completes, the CMake script runs the deploy helper that copies the runtime artifacts (DLL/.so/.dylib) and `pluginconfig.json` (if present) into `bakkes_plugin/deploy/`.

**6) Deploy / Test locally**
- After a successful build, check `bakkes_plugin/deploy/` for `RLTrainingJournalPlugin.dll` (Windows) or the appropriate binary for your platform, plus `pluginconfig.json` if you added it.
- To test in BakkesMod:
  - Copy the files from `bakkes_plugin/deploy/` to your BakkesMod `plugins/` folder, or point the game to the files.

**7) Troubleshooting**
- CMake fails because `imgui.h` is missing: run the fetch helper or clone ImGui as shown above.
- Build errors about missing SDK headers: set `BAKKESMODSDK` to your SDK install root, or ensure `bakkes_plugin/BakkesModSDK-master` exists (a bundled fallback is included in the repo).
- If post-build copies don't run, ensure PowerShell is available on Windows and that `deploy.ps1` is executable; on non-Windows ensure `deploy.sh` has execute permission.

**8) One-liner (Windows PowerShell) to fetch ImGui, configure and build**
```pwsh
pwsh .\bakkes_plugin\scripts\fetch_imgui.ps1;
Set-Location -LiteralPath .\bakkes_plugin;
cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON;
cmake --build build --config Release --target RLTrainingJournalPlugin
```

**9) Notes on third-party files**
- `bakkes_plugin/third_party/imgui` is intentionally left uncommitted; developers should run the fetch helper. This keeps the repository small and the dependency explicit.

If you'd like, I can add a small root-level script (PowerShell + bash) that runs the steps above automatically. Tell me which platforms you want it to support and I'll add it.

---
Files mentioned:
- `bakkes_plugin/scripts/fetch_imgui.ps1`
- `bakkes_plugin/scripts/deploy.ps1`
- `bakkes_plugin/scripts/deploy.sh`
- `bakkes_plugin/deploy/` (tracked placeholder)
