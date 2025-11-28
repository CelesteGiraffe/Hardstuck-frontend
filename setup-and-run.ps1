param(
    [switch]$NoInstall,
    [switch]$BuildPlugin,
    [switch]$NoBrowser,
    [int]$UIPort = 5173,
    [int]$APIPort = 4000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
function Show-Info([string]$s){ Write-Host $s -ForegroundColor Cyan }
function Show-Success([string]$s){ Write-Host $s -ForegroundColor Green }
function Show-Error([string]$s){ Write-Host $s -ForegroundColor Red }

Show-Info "Repository root: $root"

# check for node (which implies npm available)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Show-Error "Node.js is not installed or not on PATH. Get it from https://nodejs.org/"
    exit 1
}

# Helper: run npm install in a folder where package.json exists
function Run-NpmInstall([string]$folder) {
    $packageFile = Join-Path $folder 'package.json'
    if (-not (Test-Path $packageFile)) {
        Show-Info "No package.json in $folder — skipping npm install."
        return $true
    }

    Show-Info "Running npm install in $folder..."
    Push-Location $folder
    try {
        $proc = Start-Process -FilePath npm -ArgumentList 'install' -NoNewWindow -Wait -PassThru -ErrorAction Stop
        if ($proc.ExitCode -eq 0) {
            Show-Success "Dependencies installed in: $folder"
            Pop-Location
            return $true
        }
        else {
            Show-Error "npm install failed in $folder (exit $($proc.ExitCode))."
            Pop-Location
            return $false
        }
    }
    catch {
        Show-Error "npm install threw an error in $folder: $($_.Exception.Message)"
        Pop-Location
        return $false
    }
}

# By default install root, ui, api unless NoInstall was passed
$successRoot = $true; $successUI = $true; $successAPI = $true
if (-not $NoInstall) {
    $successRoot = Run-NpmInstall $root
    $uiFolder = Join-Path $root 'ui'
    $successUI = Run-NpmInstall $uiFolder
    $apiFolder = Join-Path $root 'api'
    $successAPI = Run-NpmInstall $apiFolder
} else {
    Show-Info "Skipping dependency install because -NoInstall was provided."
}

if ($successRoot -and $successUI -and $successAPI) {
    Show-Success "All three dependency checks passed. Proceeding to start the project."

    if ($BuildPlugin) {
        # Optional plugin build step (replicates prior setup.ps1 behavior)
        $pluginDir = Join-Path $root 'bakkes_plugin'
        if (Test-Path $pluginDir) {
            try {
                Show-Info "Building native plugin (bakkes_plugin) with CMake..."
                Push-Location $pluginDir
                cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
                cmake --build build --config Release --target RLTrainingJournalPlugin
                Show-Success "Native plugin built successfully."
                Pop-Location
            }
            catch {
                Show-Error "Failed to build bakkes_plugin: $($_.Exception.Message)"
                Pop-Location
            }
        }
        else { Show-Info "No bakkes_plugin folder found — skipping plugin build." }
    }

    # Start the dev server using root npm start (same as previous workflow)
    Show-Info "Starting development servers (running 'npm start' from root)."
    Push-Location $root
    try {
        # Start npm start in a new window/process so we can continue to open the browser.
        $startProc = Start-Process -FilePath npm -ArgumentList 'start' -WorkingDirectory $root -PassThru -ErrorAction Stop
        Show-Info "Started 'npm start' (PID $($startProc.Id)). Waiting a few seconds for servers to come up..."
    }
    catch {
        Show-Error "Failed to start 'npm start': $($_.Exception.Message)"
        Pop-Location
        exit 1
    }
    Pop-Location

    # If requested, open the UI endpoint in the default browser
    if (-not $NoBrowser) {
        $uiUrl = "http://localhost:$UIPort"
        # Wait briefly to give the dev servers a chance to bind before opening browser
        Start-Sleep -Seconds 3
        try {
            Show-Info "Opening UI in browser at $uiUrl"
            Start-Process $uiUrl
            Show-Success "Browser opened: $uiUrl"
        }
        catch {
            Show-Error "Failed to open browser: $($_.Exception.Message)"
        }
    }

    Show-Success "Setup-and-run finished — dev servers are running (check console where 'npm start' was launched)."
}
else {
    Show-Error "One or more installs failed. Not starting the server. Please fix errors above and run again.";
    exit 1
}
