import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHECKER = resolve(ROOT, 'Automation', 'check-budgets.mjs')
const PASSING_PERF = Object.freeze({
  maxCalls: 63,
  maxTriangles: 100_000,
  maxPrograms: 62,
  textureGpuMB: 72,
  jsHeapPeakMB: 230,
})

function runChecker(perf, extraArgs = []) {
  const temporary = mkdtempSync(join(tmpdir(), 'check-budgets-'))
  const perfPath = join(temporary, 'perf.json')
  writeFileSync(perfPath, JSON.stringify(perf))
  const run = spawnSync(process.execPath, [CHECKER, perfPath, ...extraArgs], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  const result = run.stdout ? JSON.parse(run.stdout) : null
  return { ...run, result, cleanup: () => rmSync(temporary, { recursive: true, force: true }), temporary }
}

test('pipelines 48 passes and programs 62 remains reference-only', () => {
  const run = runChecker({ ...PASSING_PERF, maxPipelines: 48 })
  try {
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.result.pass, true)
    assert.deepEqual(run.result.checks.pipelines, {
      value: 48,
      limit: 48,
      status: 'pass',
      allowUnknown: true,
      method: 'measured(input)',
      source: 'perf.maxPipelines',
    })
    assert.deepEqual(run.result.checks.programs, {
      value: 62,
      status: 'reference',
      evaluated: false,
      reason: '참고값(예산 판정 제외)',
    })
  } finally {
    run.cleanup()
  }
})

test('pipelines 49 fails the low preset', () => {
  const run = runChecker({ ...PASSING_PERF, pipelines: 49 })
  try {
    assert.equal(run.status, 1)
    assert.equal(run.result.pass, false)
    assert.equal(run.result.checks.pipelines.status, 'fail')
  } finally {
    run.cleanup()
  }
})

test('missing pipelines is explicitly pending and does not fail', () => {
  const run = runChecker(PASSING_PERF)
  try {
    assert.equal(run.status, 0, run.stderr)
    assert.equal(run.result.pass, true)
    assert.deepEqual(run.result.checks.pipelines, {
      value: '측정값 없음',
      limit: 48,
      status: 'unknown',
      allowUnknown: true,
      reason: '측정값 없음 = 판정 보류',
    })
  } finally {
    run.cleanup()
  }
})

test('--pipelines-json consumes the R108 probe peak and applies it to base too', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'check-budgets-pipelines-'))
  const perfPath = join(temporary, 'perf.json')
  const probePath = join(temporary, 'pipelines.json')
  try {
    writeFileSync(perfPath, JSON.stringify(PASSING_PERF))
    writeFileSync(probePath, JSON.stringify({ peak: { pipelines: 48, infoPrograms: 63 } }))
    const result = spawnSync(
      process.execPath,
      [CHECKER, perfPath, '--preset', 'base', '--pipelines-json', probePath],
      { cwd: ROOT, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.checks.pipelines.value, 48)
    assert.equal(report.checks.pipelines.limit, 48)
    assert.equal(report.checks.pipelines.method, 'measured(probe)')
    assert.equal(report.pass, true)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
