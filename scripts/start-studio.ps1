$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$fallbackNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$fallbackPnpm = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"

function Test-NodeVersion {
  param([string]$Path)

  try {
    $versionText = (& $Path --version).TrimStart("v")
    $version = [Version]$versionText
    return ($version.Major -gt 22 -or ($version.Major -eq 22 -and $version.Minor -ge 13))
  } catch {
    return $false
  }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = $null
$usingFallbackNode = $false

if ($nodeCommand -and (Test-NodeVersion -Path $nodeCommand.Source)) {
  $nodePath = $nodeCommand.Source
} elseif ((Test-Path -LiteralPath $fallbackNode) -and (Test-NodeVersion -Path $fallbackNode)) {
  $nodePath = $fallbackNode
  $usingFallbackNode = $true
  $env:Path = "$(Split-Path -Parent $fallbackNode);$env:Path"
}

if (-not $nodePath) {
  throw "Node.js 22.13 or newer is required."
}

$pnpmPath = $null
if ($usingFallbackNode -and (Test-Path -LiteralPath $fallbackPnpm)) {
  $pnpmPath = $fallbackPnpm
} else {
  $pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  $pnpmPath = if ($pnpmCommand) { $pnpmCommand.Source } else { $null }
  if (-not $pnpmPath -and (Test-Path -LiteralPath $fallbackPnpm)) {
    $pnpmPath = $fallbackPnpm
  }
}

if (-not $pnpmPath) {
  throw "pnpm was not found. Install pnpm and try again."
}

Set-Location -LiteralPath $projectRoot

try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/local/workspaces" -TimeoutSec 2 | Out-Null
  Start-Process "http://127.0.0.1:3000"
  Write-Host "Etsy Listing Studio is already running."
  exit 0
} catch {
  # Start a new server below.
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
  Write-Host "Installing Etsy Listing Studio dependencies..."
  & $pnpmPath install
  if ($LASTEXITCODE -ne 0) {
    throw "Dependency installation failed."
  }
}

$outputLog = Join-Path $projectRoot ".studio-launch.log"
$errorLog = Join-Path $projectRoot ".studio-launch.err.log"
$server = Start-Process -FilePath $pnpmPath `
  -ArgumentList @("dev") `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $outputLog `
  -RedirectStandardError $errorLog `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Starting Etsy Listing Studio..."
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if ($server.HasExited) {
    throw "The server stopped during startup. Check .studio-launch.err.log."
  }

  try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/local/workspaces" -TimeoutSec 2 | Out-Null
    Start-Process "http://127.0.0.1:3000"
    Write-Host "Etsy Listing Studio is ready at http://127.0.0.1:3000"
    exit 0
  } catch {
    Start-Sleep -Milliseconds 500
  }
}

throw "The server did not become ready. Check .studio-launch.log and .studio-launch.err.log."
