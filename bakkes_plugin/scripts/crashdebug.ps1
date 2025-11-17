param(
    [int]$Tail = 500
)

$ErrorActionPreference = 'Continue'
$scriptName = Split-Path -Leaf $MyInvocation.MyCommand.Definition
Write-Host "Running $scriptName (gathers bakkesmod logs, event viewer errors, and DLL info)"

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
# Use crashdebug_reports subfolder by default
$reportsDir = Join-Path $root 'crashdebug_reports'
if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir | Out-Null }
$reportName = "crashdebug_report_$(Get-Date -Format yyyyMMdd-HHmmss).txt"
$reportPath = Join-Path $reportsDir $reportName

"Crash debug report generated: $(Get-Date)" | Out-File -FilePath $reportPath -Encoding utf8
"Repository root: $root" | Out-File -FilePath $reportPath -Append -Encoding utf8
"" | Out-File -FilePath $reportPath -Append -Encoding utf8

# 1) Tail of bakkesmod.log
$bakkesLog = Join-Path $env:APPDATA 'bakkesmod\bakkesmod.log'
"-- bakkesmod.log tail (last $Tail lines) --" | Out-File -FilePath $reportPath -Append -Encoding utf8
if (Test-Path $bakkesLog) {
    try {
        Get-Content -Path $bakkesLog -Tail $Tail -ErrorAction Stop | Out-File -FilePath $reportPath -Append -Encoding utf8
    } catch {
        "Unable to read bakkesmod.log: $_" | Out-File -FilePath $reportPath -Append -Encoding utf8
    }
} else {
    "bakkesmod.log not found at $bakkesLog" | Out-File -FilePath $reportPath -Append -Encoding utf8
}

"" | Out-File -FilePath $reportPath -Append -Encoding utf8

# 2) Recent Application errors from Event Log that mention RLTraining or Bakkes
"-- Recent Application Error events (last 60 minutes) --" | Out-File -FilePath $reportPath -Append -Encoding utf8
try {
    $events = Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2; StartTime=(Get-Date).AddMinutes(-60)} -ErrorAction Stop |
              Where-Object { $_.Message -match 'RLTraining|RL Training|RLTrainingJournal|bakkesmod|RLTrainingJournalPlugin' }
    if ($events) {
        $events | Select-Object TimeCreated, ProviderName, Id, LevelDisplayName, @{Name='Message';Expression={$_.Message}} |
            ForEach-Object { $_ | Out-String } | Out-File -FilePath $reportPath -Append -Encoding utf8
    } else {
        "(no matching Application error events found in the last 60 minutes)" | Out-File -FilePath $reportPath -Append -Encoding utf8
    }
} catch {
    "Unable to query Event Log: $_" | Out-File -FilePath $reportPath -Append -Encoding utf8
}

"" | Out-File -FilePath $reportPath -Append -Encoding utf8

# 3) Deployed files
"-- Deployed files (bakkes_plugin/deploy) --" | Out-File -FilePath $reportPath -Append -Encoding utf8
$deployDir = Join-Path $root 'deploy'
if (Test-Path $deployDir) {
    Get-ChildItem -Path $deployDir -Recurse -File | Select-Object FullName, Length, LastWriteTime | ForEach-Object { $_ | Out-String } | Out-File -FilePath $reportPath -Append -Encoding utf8
} else {
    "deploy directory not found at $deployDir" | Out-File -FilePath $reportPath -Append -Encoding utf8
}

"" | Out-File -FilePath $reportPath -Append -Encoding utf8

# 4) DLL PE header (machine) and optional dumpbin dependents
function Get-PeMachine {
    param([string]$Path)
    try {
        $fs = [IO.File]::OpenRead($Path)
        $br = New-Object System.IO.BinaryReader($fs)
        $fs.Position = 0x3C
        $pe = $br.ReadInt32()
        $fs.Position = $pe + 4
        $machine = $br.ReadUInt16()
        $br.Close(); $fs.Close();
        switch ($machine) {
            0x014c { return 'x86 (0x014C)'}
            0x8664 { return 'x64 (0x8664)'}
            default { return ('0x{0:X4}' -f $machine) }
        }
    } catch {
        return "Unable to read PE header: $_"
    }
}

if (Test-Path $deployDir) {
    $dll = Get-ChildItem -Path $deployDir -Filter *.dll -File | Select-Object -First 1
    if ($dll) {
        "-- Deployed DLL info --" | Out-File -FilePath $reportPath -Append -Encoding utf8
        "Path: $($dll.FullName)" | Out-File -FilePath $reportPath -Append -Encoding utf8
        "Machine: $(Get-PeMachine -Path $dll.FullName)" | Out-File -FilePath $reportPath -Append -Encoding utf8

        # Attempt dumpbin if available
        try {
            $dumpbinPath = (Get-Command dumpbin.exe -ErrorAction SilentlyContinue).Source
            if ($dumpbinPath) {
                "dumpbin found at: $dumpbinPath" | Out-File -FilePath $reportPath -Append -Encoding utf8
                & "$dumpbinPath" /dependents "$($dll.FullName)" 2>&1 | Out-File -FilePath $reportPath -Append -Encoding utf8
            } else {
                "dumpbin.exe not found in PATH; skipping dependency scan" | Out-File -FilePath $reportPath -Append -Encoding utf8
            }
        } catch {
            "Error running dumpbin: $_" | Out-File -FilePath $reportPath -Append -Encoding utf8
        }
    } else {
        "No DLL found in deploy directory to inspect" | Out-File -FilePath $reportPath -Append -Encoding utf8
    }
}

"" | Out-File -FilePath $reportPath -Append -Encoding utf8

# 5) Environment info
"-- Environment --" | Out-File -FilePath $reportPath -Append -Encoding utf8
"OS: $([System.Environment]::OSVersion)" | Out-File -FilePath $reportPath -Append -Encoding utf8
"User: $env:USERNAME" | Out-File -FilePath $reportPath -Append -Encoding utf8
"PowerShell: $($PSVersionTable.PSVersion)" | Out-File -FilePath $reportPath -Append -Encoding utf8

Write-Host "Report saved to: $reportPath"
Write-Host "Showing last 200 lines of report:"
Get-Content -Path $reportPath -Tail 200 | Write-Host
