import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATOR = resolve(ROOT, 'src', 'scene', 'foliage', 'grassLiteGeometry.ts')
const SCENE_TRIS = resolve(ROOT, 'Automation', 'scene-tris.mjs')
const LOOKDEV = JSON.parse(readFileSync(resolve(ROOT, 'src', 'data', 'lookdev.json'), 'utf8'))
const { buildGrassLiteGeometry } = await import(pathToFileURL(GENERATOR).href)
const { buildSceneTrisReport, parseSceneTrisArgs } = await import(pathToFileURL(SCENE_TRIS).href)

test('three crossed double-sided quads stay at 12 tris with a ground pivot', () => {
  const geometry = buildGrassLiteGeometry()
  assert.equal(geometry.triangleCount, 12)
  assert.ok(geometry.triangleCount <= 12)
  assert.equal(geometry.index.length, geometry.triangleCount * 3)
  assert.equal(geometry.positions.length, 24 * 3)
  assert.equal(geometry.normals.length, geometry.positions.length)
  assert.equal(geometry.colors.length, geometry.positions.length)
  assert.ok(Math.max(...geometry.index) < geometry.positions.length / 3)
  assert.equal(geometry.bounds.minY, 0)
  assert.ok(geometry.bounds.maxY >= 0.22 && geometry.bounds.maxY <= 0.28)
  assert.ok(geometry.bounds.radiusXZ <= 0.25)
  assert.equal('alpha' in geometry, false)
})

test('seed is deterministic and changes geometry/color variation', () => {
  const a = buildGrassLiteGeometry(0x20260826)
  const b = buildGrassLiteGeometry(0x20260826)
  const c = buildGrassLiteGeometry(0x20260827)
  assert.deepEqual([...a.positions], [...b.positions])
  assert.deepEqual([...a.colors], [...b.colors])
  assert.notDeepEqual([...a.positions], [...c.positions])
  assert.notDeepEqual([...a.colors], [...c.colors])
})

test('normals are unit length and vertex colors retain the frozen foliage HSL', () => {
  const geometry = buildGrassLiteGeometry()
  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const length = Math.hypot(geometry.normals[offset], geometry.normals[offset + 1], geometry.normals[offset + 2])
    assert.ok(Math.abs(length - 1) < 1e-6)
  }
  for (let offset = 0; offset < geometry.colors.length; offset += 3) {
    const hsl = rgbToHsl(
      linearToSrgb(geometry.colors[offset]),
      linearToSrgb(geometry.colors[offset + 1]),
      linearToSrgb(geometry.colors[offset + 2]),
    )
    assert.ok(hsl.h >= 67.9 && hsl.h <= 68.1, `h=${hsl.h}`)
    assert.ok(hsl.s >= 23.9 && hsl.s <= 24.1, `s=${hsl.s}`)
    assert.ok(hsl.l >= 18 && hsl.l <= 22, `l=${hsl.l}`)
  }
})

test('--grass-lite recalculates low/base while preserving the baseline comparison', async () => {
  assert.deepEqual(
    parseSceneTrisArgs(['--preset', 'low', '--grass-lite', '--out', 'out.json']),
    { preset: 'low', out: 'out.json', grassLite: true },
  )
  const low = await buildSceneTrisReport('low', ROOT, { grassLite: true })
  const base = await buildSceneTrisReport('base', ROOT, { grassLite: true })
  assert.equal(low.variant.id, 'grassLite')
  assert.equal(low.variant.trianglesPerGrass, 12)
  assert.equal(low.variant.baselineComparison.low.worstCaseTriangles, 816434)
  assert.equal(low.scenarios.worstCase.totalTriangles, 312434)
  assert.equal(low.scenarios.typical.totalTriangles, 310736)
  assert.equal(low.scenarios.worstCase.budget.status, 'pass')
  assert.equal(base.scenarios.worstCase.totalTriangles, 704834)
  assert.equal(base.scenarios.typical.totalTriangles, 703136)
  assert.equal(base.scenarios.worstCase.budget.status, 'fail')
})

test('CLI writes a grassLite evidence report without a browser', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'grass-lite-'))
  const out = join(temporary, 'report.json')
  try {
    const result = spawnSync(
      process.execPath,
      [SCENE_TRIS, '--preset', 'low', '--grass-lite', '--out', out],
      { cwd: ROOT, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(report.variant.enabled, true)
    assert.equal(report.comparison.low.budgetStatus, 'pass')
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})

function linearToSrgb(value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  const l = (max + min) / 2
  let h = 0
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6
    else if (max === g) h = (b - r) / delta + 2
    else h = (r - g) / delta + 4
    h = (h * 60 + 360) % 360
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return { h, s: s * 100, l: l * 100 }
}

// R67-A 채택: master 결정(R64-A 판정 ADOPT — baseline 8/12 유지, low worst tris 312,434 ≤600K)으로 기본값이 on 이다.
test('lookdev.grassLite is enabled by default after R67-A adoption (query ?grassLite=0 still forces off)', () => {
  assert.equal(LOOKDEV.grassLite.enabled, true) // R67-A 채택
  assert.equal(LOOKDEV.grassLite.seed, 539363366)
  assert.equal(LOOKDEV.grassLite.maxTrianglesPerInstance, 12)
  assert.match(LOOKDEV.grassLite.adopted, /R67-A/)
})
