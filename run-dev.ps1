param(
    [switch]$NoInstall
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node is required but not found. Install Node.js from https://nodejs.org/"
    exit 1
}

node (Join-Path $root 'tools\dev-start.js')
