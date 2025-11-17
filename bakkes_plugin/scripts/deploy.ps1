<#
.SYNOPSIS
  Copies built plugin runtime files into the `bakkes_plugin/deploy/` folder.

.DESCRIPTION
  This script looks in a set of common build output locations (for Visual Studio / CMake)
  and copies files matching the provided patterns into `../deploy/` so you can track
  the minimal artifacts required for testing.

  It is intentionally conservative and will not delete files in `deploy/`.

.PARAMETER Source
  Relative path (from plugin root) to search first. Defaults to several common locations.

.PARAMETER Patterns
  Array of glob patterns to copy. Default: `*.dll`, `*.ini`, `*.json`, `*.so`, `*.dylib`.

.PARAMETER Recurse
  If provided, searches directories recursively.

Examples:
  pwsh .\scripts\deploy.ps1 -Source "build/Release" -Patterns "RLTrainingJournalPlugin.dll"
  pwsh .\scripts\deploy.ps1 -Recurse
#>
param(
    [string]$Source = "",
    [string[]]$Patterns = @("*.dll","*.ini","*.json","*.so","*.dylib"),
    [switch]$Recurse
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$pluginRoot = Resolve-Path (Join-Path $scriptRoot "..")

# Candidate locations (relative to plugin root)
$candidates = @(
    "build/Release",
    "build/x64/Release",
    "Release",
    "x64/Release",
    "build"
)

if ($Source -and $Source.Trim() -ne "") {
    $candidates = ,$Source + $candidates
}

$foundSource = $null
foreach ($c in $candidates) {
    $p = Join-Path $pluginRoot $c
    if (Test-Path $p) { $foundSource = (Resolve-Path $p).Path; break }
}

if (-not $foundSource) {
    Write-Error "No build output folder found. Checked: $($candidates -join ', ')"
    exit 2
}

$deployDir = Join-Path $pluginRoot 'deploy'
if (-not (Test-Path $deployDir)) { New-Item -ItemType Directory -Path $deployDir | Out-Null }

$copied = @()
$copiedBasenames = @()
foreach ($pattern in $Patterns) {
    if ($Recurse) {
        $items = Get-ChildItem -Path $foundSource -Filter $pattern -Recurse -File -ErrorAction SilentlyContinue
    } else {
        $items = Get-ChildItem -Path $foundSource -Filter $pattern -File -ErrorAction SilentlyContinue
    }
    foreach ($it in $items) {
      $dest = Join-Path $deployDir $it.Name
      Copy-Item -Path $it.FullName -Destination $dest -Force
      $copied += $it.FullName
      $copiedBasenames += $it.Name
      Write-Host "Copied: $($it.FullName) -> $dest"
    }
}

  # Also copy pluginconfig.json from the plugin root if present and not already copied
  $pluginConfigPath = Join-Path $pluginRoot 'pluginconfig.json'
  if (Test-Path $pluginConfigPath) {
    if ($copiedBasenames -contains 'pluginconfig.json') {
      Write-Host "pluginconfig.json already copied from build output; skipping additional copy."
    } else {
      $dest = Join-Path $deployDir 'pluginconfig.json'
      Copy-Item -Path $pluginConfigPath -Destination $dest -Force
      $copied += $pluginConfigPath
      Write-Host "Copied: $pluginConfigPath -> $dest"
    }
  }

  if ($copied.Count -eq 0) {
    Write-Warning "No files matched the given patterns in $foundSource and no pluginconfig.json was found."
    exit 1
  }

  Write-Host "Done. Copied $($copied.Count) file(s) into $deployDir"
  exit 0
exit 0
