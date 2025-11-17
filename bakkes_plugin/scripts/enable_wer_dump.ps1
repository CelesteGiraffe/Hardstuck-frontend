<#
Enables Windows Error Reporting (WER) LocalDumps for RocketLeague.exe under HKCU
so that when Rocket League crashes Windows will write a full user-mode dump to the
specified folder. This avoids attaching a debugger to the process (safer with
anti-cheat systems). Run this script, reproduce the crash, and a .dmp file will
be placed into `bakkes_plugin/crashdebug_reports/dumps`.

This script does not require administrative privileges (writes under HKCU).
It will create the folder, set the registry keys, then wait for a dump up to
the provided timeout (default 10 minutes). It prints the dump path when created
and leaves the registry entries in place (use -Cleanup to remove them).

Usage:
  pwsh .\bakkes_plugin\scripts\enable_wer_dump.ps1    # sets WER, waits 10m
  pwsh .\bakkes_plugin\scripts\enable_wer_dump.ps1 -TimeoutMinutes 30
  pwsh .\bakkes_plugin\scripts\enable_wer_dump.ps1 -Cleanup

Warning: After you capture the dump you may want to remove the registry keys
with the -Cleanup switch so the behavior returns to normal.
#>

param(
    [int]$TimeoutMinutes = 10,
    [switch]$Cleanup
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$repoRoot = Resolve-Path (Join-Path $scriptRoot '..')
$reportsDir = Join-Path $repoRoot 'crashdebug_reports'
$dumpsDir = Join-Path $reportsDir 'dumps'

if ($Cleanup) {
    $regPath = 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting\LocalDumps\RocketLeague.exe'
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force
        Write-Host "Removed WER LocalDumps registry key for RocketLeague.exe: $regPath"
    } else {
        Write-Host "No WER LocalDumps registry key found for RocketLeague.exe"
    }
    exit 0
}

if (-not (Test-Path $dumpsDir)) { New-Item -ItemType Directory -Path $dumpsDir -Force | Out-Null }

$regBase = 'HKCU:\Software\Microsoft\Windows\Windows Error Reporting\LocalDumps\RocketLeague.exe'
if (-not (Test-Path $regBase)) { New-Item -Path $regBase -Force | Out-Null }

New-ItemProperty -Path $regBase -Name DumpFolder -Value $dumpsDir -PropertyType ExpandString -Force | Out-Null
New-ItemProperty -Path $regBase -Name DumpCount -Value 10 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $regBase -Name DumpType -Value 2 -PropertyType DWord -Force | Out-Null

Write-Host "WER LocalDumps enabled for RocketLeague.exe"
Write-Host "Dumps will be written to: $dumpsDir"
Write-Host "Timeout (minutes): $TimeoutMinutes"
Write-Host "Reproduce the crash now (click the plugin in BakkesMod). This script will wait for a dump to appear."

$end = (Get-Date).AddMinutes($TimeoutMinutes)
while ((Get-Date) -lt $end) {
    $dumps = Get-ChildItem -Path $dumpsDir -Filter "*.dmp" -File -ErrorAction SilentlyContinue
    if ($dumps -and $dumps.Count -gt 0) {
        Write-Host "Dump(s) detected:" -ForegroundColor Green
        $dumps | ForEach-Object { Write-Host $_.FullName }
        exit 0
    }
    Start-Sleep -Seconds 3
}

Write-Host "Timeout reached; no dump detected in $dumpsDir"
Write-Host "You can remove the registry entries with: pwsh .\bakkes_plugin\scripts\enable_wer_dump.ps1 -Cleanup"
exit 2
