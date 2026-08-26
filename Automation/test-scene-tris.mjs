import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = resolve(ROOT, 'Automation', 'scene-tris.mjs')
const BUDGET_CHECKER = resolve(ROOT, 'Automation', 'check-budgets.mjs')
const { buildSceneTrisReport, parseSceneTrisArgs } = await import(pathToFileURL(SCRIPT).href)

test('CLI requires a supported preset and output path', () => {
  assert.deepEqual(parseSceneTrisArgs(['--preset', 'low', '--out', 'result.json']), {
    preset: 'low',
    out: 'result.json',
  })
  assert.throws(() => parseSceneTrisArgs(['--preset', 'ultra', '--out', 'x.json']), /low or base/)
  assert.throws(() => parseSceneTrisArgs(['--preset', 'low']), /--out/)
})

test('low sums every component and exposes auditable sources', async () => {
  const report = await buildSceneTrisReport('low', ROOT)
  assert.equal(report.inputs.heroTree.lod0Triangles, 2416)
  assert.equal(report.inputs.heroTree.lod1Triangles, 718)
  assert.deepEqual(report.inputs.foliage.countsBySpecies, {
    grass: 4200,
    flower_yellowA: 1200,
    plant_bush: 600,
  })
  assert.deepEqual(report.inputs.rocks.countsBySpecies, {
    rock_smallA: 100,
    rock_smallFlatA: 100,
    rock_tallA: 100,
  })
  assert.deepEqual(
    { triangles: report.inputs.foliage.runtimeGlb.totalTriangles, ledgerMatch: report.inputs.foliage.runtimeGlb.matchesLedger },
    { triangles: 240, ledgerMatch: true },
  )
  assert.deepEqual(
    { triangles: report.inputs.rocks.runtimeGlb.totalTriangles, ledgerMatch: report.inputs.rocks.runtimeGlb.matchesLedger },
    { triangles: 172, ledgerMatch: true },
  )
  assert.equal(report.scenarios.worstCase.totalTriangles, 816434)
  assert.equal(report.scenarios.typical.totalTriangles, 814736)
  assert.equal(report.scenarios.worstCase.budget.status, 'fail')

  for (const scenario of Object.values(report.scenarios)) {
    const sum = Object.values(scenario.components).reduce((total, component) => total + component.triangles, 0)
    assert.equal(sum, scenario.totalTriangles)
    assert.ok(Object.values(scenario.components).every((component) => component.source.method && component.source.ref))
    const ratio = Object.values(scenario.components).reduce((total, component) => total + component.ratioPct, 0)
    assert.ok(Math.abs(ratio - 100) < 0.01, `${scenario.id} ratio=${ratio}`)
  }

  assert.equal(report.sourceSummary.directGenerator.length, 1)
  assert.ok(report.sourceSummary.assetsCsv.length >= 2)
  assert.equal(report.sourceSummary.glbBinary.length, 2)
  assert.ok(report.sourceSummary.qaJson.length >= 1)
  assert.ok(report.sourceSummary.sourceFormula.length >= 2)
})

test('base comparison uses preset instance counts and remains over budget', async () => {
  const report = await buildSceneTrisReport('base', ROOT)
  assert.equal(report.scenarios.worstCase.totalTriangles, 2384834)
  assert.equal(report.scenarios.typical.totalTriangles, 2383136)
  assert.equal(report.comparison.low.worstCaseTriangles, 816434)
  assert.equal(report.comparison.base.worstCaseTriangles, 2384834)
  assert.equal(report.comparison.low.worstCaseComponentRatiosPct.foliageInstances, 81.42728)
  assert.equal(report.comparison.base.worstCaseComponentRatiosPct.foliageInstances, 92.920514)
  assert.equal(report.comparison.low.budgetStatus, 'fail')
  assert.equal(report.comparison.base.budgetStatus, 'fail')
})

test('CLI writes JSON and check-budgets consumes worst-case tris as estimated(source)', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'scene-tris-'))
  const trisPath = join(temporary, 'tris.json')
  const perfPath = join(temporary, 'perf.json')
  try {
    const cli = spawnSync(process.execPath, [SCRIPT, '--preset', 'low', '--out', trisPath], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(JSON.parse(readFileSync(trisPath, 'utf8')).scenarios.worstCase.totalTriangles, 816434)

    writeFileSync(perfPath, JSON.stringify({
      maxCalls: 63,
      maxTriangles: 0,
      maxPrograms: 39,
      textureGpuMB: 37,
      jsHeapPeakMB: 78,
    }))
    const budget = spawnSync(
      process.execPath,
      [BUDGET_CHECKER, perfPath, '--tris-json', trisPath],
      { cwd: ROOT, encoding: 'utf8' },
    )
    assert.equal(budget.status, 1, budget.stderr)
    assert.deepEqual(JSON.parse(budget.stdout).checks.tris, {
      value: 816434,
      limit: 600000,
      status: 'fail',
      allowUnknown: true,
      method: 'estimated(source)',
      scenario: 'worstCase',
      source: trisPath.replaceAll('\\', '/'),
    })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
