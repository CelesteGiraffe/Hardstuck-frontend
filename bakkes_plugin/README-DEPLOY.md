This folder is for the small set of build artifacts needed to test the plugin locally.

What to put here:
- Copy the compiled plugin DLL (for example `RLTrainingJournalPlugin.dll`) into this folder.
- Copy any other runtime file required by the plugin (for example a `.ini` or supporting `.dll`) into this folder.

Why this exists:
- The repository ignores build outputs to avoid committing large IDE/CMake files and binaries.
- Placing the minimal runtime artifacts in `deploy/` lets you keep only what is necessary to test or distribute the plugin.

How to use:
1. Build the plugin locally (using your normal build steps).
2. Copy the needed files into `bakkes_plugin/deploy/`.
3. Commit only those files if you want them tracked. The `.gitignore` is configured to allow this folder.

Automatic copy scripts
----------------------
Two small scripts are provided to help copy the minimal files from common build output directories into `bakkes_plugin/deploy/`:

- `scripts/deploy.ps1` — PowerShell script for Windows (works in `pwsh` and Windows PowerShell).
- `scripts/deploy.sh` — POSIX shell script for macOS / Linux.

Both scripts look for build outputs in common locations (for example `build/Release` or `Release`) and will copy matching runtime files into `deploy/`.

Examples
--------

PowerShell (from repository root):

```powershell
pwsh .\bakkes_plugin\scripts\deploy.ps1         # copy default patterns from common Release folders
pwsh .\bakkes_plugin\scripts\deploy.ps1 -Source "build/Release" -Patterns "RLTrainingJournalPlugin.dll"
pwsh .\bakkes_plugin\scripts\deploy.ps1 -Recurse -Patterns "*.dll","*.ini"
```

macOS / Linux:

```bash
./bakkes_plugin/scripts/deploy.sh                 # copy default patterns from common Release folders
./bakkes_plugin/scripts/deploy.sh build/Release "RLTrainingJournalPlugin.dll"
./bakkes_plugin/scripts/deploy.sh 
```

Notes
-----
- The scripts will create `bakkes_plugin/deploy/` if it doesn't exist.
- They will overwrite existing files in `deploy/` with the copied versions.
- The scripts do not delete files from `deploy/` so you can keep hand-picked artifacts there.

If you'd like I can also add a simple CMake post-build step or a Visual Studio post-build step to automatically invoke the Windows script after a successful build — tell me which build setup you use and I can add it.
