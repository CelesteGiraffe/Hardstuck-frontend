param(
    [switch]$NoInstall,
    [switch]$BuildPlugin,
    [switch]$NoBrowser,
    [switch]$DryRun,
    [int]$UIPort = 5173,
    [int]$APIPort = 4000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
function Show-Info([string]$s){ Write-Host $s -ForegroundColor Cyan }
function Show-Success([string]$s){ Write-Host $s -ForegroundColor Green }
function Show-Error([string]$s){ Write-Host $s -ForegroundColor Red }

Show-Info ("Repository root: {0}" -f $root)

# check for node and npm
$node = Get-Command node -ErrorAction SilentlyContinue
$npm  = Get-Command npm  -ErrorAction SilentlyContinue
if (-not $node -or -not $npm) {
    Show-Error "Node.js and/or npm are not installed or not on PATH. Install Node.js (includes npm) from https://nodejs.org/"
    exit 1
}

# Helper: run npm install in a folder where package.json exists
function Run-NpmInstall([string]$folder) {
    $packageFile = Join-Path $folder 'package.json'
    if (-not (Test-Path $packageFile)) {
        Show-Info ("No package.json in {0} - skipping npm install." -f ${folder})
        return $true
    }

    Show-Info ("Running npm install in {0}..." -f ${folder})
    Push-Location $folder
    try {
        # On Windows, running 'npm' via Start-Process can fail due to how cmd shims are handled.
        # Use cmd /c npm install on Windows; otherwise call npm directly.
        $runningOnWindows = ($env:OS -eq 'Windows_NT') -or ($PSVersionTable.Platform -match 'Win')
        if ($runningOnWindows) {
            & cmd /c npm install
            $exit = $LASTEXITCODE
        }
        else {
            & npm install
            $exit = $LASTEXITCODE
        }

        if ($exit -eq 0) {
            Show-Success ("Dependencies installed in: {0}" -f ${folder})
            Pop-Location
            return $true
        }
        else {
            Show-Error ("npm install failed in {0} (exit {1})." -f ${folder}, $exit)
            Pop-Location
            return $false
        }
    }
    catch {
            # use explicit formatting / braces to avoid PowerShell parser ambiguity when using ':' next to variables
            Show-Error ("npm install threw an error in {0}: {1}" -f ${folder}, $_.Exception.Message)
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
    Show-Info 'Skipping dependency install because -NoInstall was provided.'
}

if ($successRoot -and $successUI -and $successAPI) {
    Show-Success 'All three dependency checks passed. Proceeding to start the project.'

    if ($DryRun) {
        Show-Info 'Dry run requested - not starting servers or opening a browser.'
        Show-Info ('Would run: npm start in {0}; open http://localhost:{1} in browser (unless -NoBrowser).' -f $root, $UIPort)
        exit 0
    }

    if ($BuildPlugin) {
        # Optional plugin build step (replicates prior setup.ps1 behavior)
        $pluginDir = Join-Path $root 'bakkes_plugin'
        if (Test-Path $pluginDir) {
            try {
                Show-Info 'Building native plugin (bakkes_plugin) with CMake...'
                Push-Location $pluginDir
                cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
                cmake --build build --config Release --target RLTrainingJournalPlugin
                Show-Success 'Native plugin built successfully.'
                Pop-Location
            }
            catch {
                Show-Error ("Failed to build bakkes_plugin: {0}" -f $_.Exception.Message)
                Pop-Location
            }
        }
        else { Show-Info 'No bakkes_plugin folder found - skipping plugin build.' }
    }

    # Start the dev server using root npm start (same as previous workflow)
    Show-Info "Starting development servers (running 'npm start' from root)."
    Push-Location $root
        try {
        # Start npm start in a new process. On Windows use cmd.exe /c to avoid exe/shim issues.
        $runningOnWindows = ($env:OS -eq 'Windows_NT') -or ($PSVersionTable.Platform -match 'Win')
        if ($runningOnWindows) {
            $startProc = Start-Process -FilePath $env:ComSpec -ArgumentList '/c npm start' -WorkingDirectory $root -PassThru -ErrorAction Stop
            # ComSpec spawns cmd.exe which will have its own PID; report the PID of the process we started.
            Show-Info ("Started 'npm start' (PID {0}). Waiting a few seconds for servers to come up..." -f $startProc.Id)
        }
        else {
            $startProc = Start-Process -FilePath npm -ArgumentList 'start' -WorkingDirectory $root -PassThru -ErrorAction Stop
            Show-Info ("Started 'npm start' (PID {0}). Waiting a few seconds for servers to come up..." -f $startProc.Id)
        }
    }
    catch {
        Show-Error ("Failed to start 'npm start': {0}" -f $_.Exception.Message)
        Pop-Location
        exit 1
    }
    Pop-Location

    # If requested, open the UI endpoint in the default browser
    if (-not $NoBrowser) {
    $uiUrl = ('http://localhost:{0}' -f $UIPort)
        # Wait briefly to give the dev servers a chance to bind before opening browser
        Start-Sleep -Seconds 3
        try {
            Show-Info ("Opening UI in browser at {0}" -f $uiUrl)
            Start-Process $uiUrl
            Show-Success ("Browser opened: {0}" -f $uiUrl)
        }
        catch {
            Show-Error ("Failed to open browser: {0}" -f $_.Exception.Message)
        }
    }

    Show-Success 'Setup-and-run finished - dev servers are running (check console where "npm start" was launched).'
}
else {
        Show-Error 'One or more installs failed. Not starting the server. Please fix errors above and run again'
    exit 1
}
