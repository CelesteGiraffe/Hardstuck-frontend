param(
    [switch]$NoFetchImgui,
    [switch]$NoNpm
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host "Repository root: $root"

if (-not $NoFetchImgui) {
    $fetchScript = Join-Path $root 'bakkes_plugin\scripts\fetch_imgui.ps1'
    if (Test-Path $fetchScript) {
        Write-Host "Fetching Dear ImGui using helper script..."
        & pwsh -NoProfile -ExecutionPolicy Bypass -File $fetchScript
    }
    else {
        Write-Host "fetch_imgui helper not found; doing a shallow git clone to third_party/imgui..."
        $imguiDir = Join-Path $root 'bakkes_plugin\third_party\imgui'
        if (-not (Test-Path $imguiDir)) {
            git clone --depth 1 https://github.com/ocornut/imgui.git $imguiDir
        }
        else {
            Write-Host "ImGui already present at $imguiDir"
        }
    }
}

if (-not $NoNpm) {
    if (Test-Path (Join-Path $root 'ui')) {
        Write-Host "Running npm install in ui/"
        Push-Location (Join-Path $root 'ui')
        npm install
        Pop-Location
    }
    if (Test-Path (Join-Path $root 'api')) {
        Write-Host "Running npm install in api/"
        Push-Location (Join-Path $root 'api')
        npm install
        Pop-Location
    }
}

Write-Host "Configuring and building plugin (bakkes_plugin)..."
Push-Location (Join-Path $root 'bakkes_plugin')
cmake -S . -B build -DRTJ_REQUIRE_IMGUI=ON
cmake --build build --config Release --target RLTrainingJournalPlugin
Pop-Location

Write-Host "Setup complete. Check bakkes_plugin/deploy/ for runtime artifacts."
