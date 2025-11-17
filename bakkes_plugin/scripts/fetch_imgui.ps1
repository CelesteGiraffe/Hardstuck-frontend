<#
Fetches Dear ImGui into `bakkes_plugin/third_party/imgui`.

Usage (from repo root or plugin folder):
  pwsh .\bakkes_plugin\scripts\fetch_imgui.ps1

This will clone the official ImGui repository (shallow clone) into the expected
third_party location so CMake can find `imgui.h` automatically.
#>

param(
    [string]$TargetDir = "${PSScriptRoot}\..\third_party\imgui",
    [string]$Repo = 'https://github.com/ocornut/imgui.git'
)

$target = Resolve-Path -LiteralPath $TargetDir -ErrorAction SilentlyContinue
if (-not $target) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

if (Test-Path (Join-Path $TargetDir 'imgui.h')) {
    Write-Host "Dear ImGui already present at: $TargetDir"
    exit 0
}

Write-Host "Cloning Dear ImGui into: $TargetDir"
git --version > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "git is required but not found on PATH. Install Git, then re-run this script."
    exit 2
}

Push-Location $TargetDir
try {
    git clone --depth 1 $Repo .
} catch {
    Write-Error "Failed to clone ImGui: $_"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "Done. ImGui cloned into: $TargetDir"
exit 0
