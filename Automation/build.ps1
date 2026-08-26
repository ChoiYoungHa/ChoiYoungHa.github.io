[CmdletBinding()]
# M4-16 (R39-C): -PerfJson must point to a JSON object accepted by
# Automation/check-budgets.mjs (metrics at the root or under a `perf` key); CSV input is not accepted.
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

  $stepTimer = [System.Diagnostics.Stopwatch]::StartNew()
  Write-Output "STEP $Name START"
  & $Command
  $stepExitCode = $LASTEXITCODE
  $stepTimer.Stop()
  Write-Output ("STEP {0} exit={1} elapsed={2:N3}s" -f $Name, $stepExitCode, $stepTimer.Elapsed.TotalSeconds)
  if ($stepExitCode -ne 0) {
    throw "STEP $Name failed with exit code $stepExitCode"
  }
}

Push-Location $repoRoot
$gateTimer = [System.Diagnostics.Stopwatch]::StartNew()
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

  # M4-16 (R39-C): validate the just-built hash-named dist chunks; keep the manifest snapshot differences visible.
  Invoke-NativeStep 'check-payload' { node Automation/check-payload.mjs --actual-build --out Docs/perf/m4-payload.json }
  $gateTimer.Stop()
  Write-Output ("BUILD_GATE PASS exit=0 elapsed={0:N3}s" -f $gateTimer.Elapsed.TotalSeconds)
  exit 0
} catch {
  $gateTimer.Stop()
  Write-Output ("BUILD_GATE FAIL exit=1 elapsed={0:N3}s" -f $gateTimer.Elapsed.TotalSeconds)
  Write-Error $_
  exit 1
} finally {
  Pop-Location
}
