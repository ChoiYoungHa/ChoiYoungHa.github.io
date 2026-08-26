[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$PerfJson = 'Docs/m2/village-integration-smoke.json',
  [string]$FileReport = 'Docs/perf/m4-file-limits.csv'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Invoke-NativeStep {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Output "STEP $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "STEP $Name failed with exit code $LASTEXITCODE"
  }
}

Push-Location $repoRoot
try {
  Invoke-NativeStep 'typecheck' { npx tsc -b }

  if ($SkipBuild) {
    Write-Output 'STEP build SKIPPED (-SkipBuild)'
  } else {
    Invoke-NativeStep 'build' { npm run build }
  }

  Invoke-NativeStep 'check-assets' { node Automation/check-assets.mjs --json }
  Invoke-NativeStep 'check-budgets' { node Automation/check-budgets.mjs $PerfJson }

  if (Test-Path -LiteralPath 'dist') {
    Invoke-NativeStep 'check-files' {
      node Automation/check-files.mjs --out $FileReport --dir public/models --dir dist
    }
  } else {
    Invoke-NativeStep 'check-files' {
      node Automation/check-files.mjs --out $FileReport --dir public/models
    }
  }

  Invoke-NativeStep 'check-payload' { node Automation/check-payload.mjs --out Docs/perf/m4-payload.json }
  Write-Output 'BUILD_GATE PASS'
  exit 0
} catch {
  Write-Error $_
  exit 1
} finally {
  Pop-Location
}
