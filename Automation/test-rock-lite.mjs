import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GENERATOR = resolve(ROOT, 'src', 'scene', 'foliage', 'rockLiteGeometry.ts')
const SCENE_TRIS = resolve(ROOT, 'Automation', 'scene-tris.mjs')
const { buildRockLiteGeometry } = await import(pathToFileURL(GENERATOR).href)
const { buildSceneTrisReport, parseSceneTrisArgs } = await import(pathToFileURL(SCENE_TRIS).href)

test('irregular octahedron stays within 24 tris and keeps a ground pivot', () => {
  const geometry = buildRockLiteGeometry()
  assert.equal(geometry.triangleCount, 8)
  assert.ok(geometry.triangleCount <= 24)
  assert.equal(geometry.index.length, geometry.triangleCount * 3)
  assert.equal(geometry.positions.length, 24 * 3)
  assert.equal(geometry.normals.length, geometry.positions.length)
  assert.equal(geometry.colors.length, geometry.positions.length)
  assert.ok(Math.max(...geometry.index) < geometry.positions.length / 3)
  assert.equal(geometry.bounds.minY, 0)
  assert.ok(geometry.bounds.maxY >= 0.35 && geometry.bounds.maxY <= 0.65)
  assert.ok(geometry.bounds.radiusXZ >= 0.25 && geometry.bounds.radiusXZ <= 0.5)
  assert.equal('alpha' in geometry, false)
})

test('seed is deterministic and changes shape/color variation', () => {
  const a = buildRockLiteGeometry(0x20260826)
  const b = buildRockLiteGeometry(0x20260826)
  const c = buildRockLiteGeometry(0x20260827)
  assert.deepEqual([...a.positions], [...b.positions])
  assert.deepEqual([...a.colors], [...b.colors])
  assert.notDeepEqual([...a.positions], [...c.positions])
  assert.notDeepEqual([...a.colors], [...c.colors])
})

test('runtime option defaults off and preserves the existing GLB branch', async () => {
  const lookdev = JSON.parse(readFileSync(resolve(ROOT, 'src', 'data', 'lookdev.json'), 'utf8'))
  const source = readFileSync(resolve(ROOT, 'src', 'scene', 'RockInstances.tsx'), 'utf8')
  assert.equal(lookdev.rockLite.enabled, false)
  assert.equal(lookdev.rockLite.palette, '#575142')
  assert.equal(lookdev.rockLite.maxTrianglesPerInstance, 8)
  assert.match(source, /query === '1'/)
  assert.match(source, /: geometryForSpecies\(scene, species\)/)
  const grassOnly = await buildSceneTrisReport('base', ROOT, { grassLite: true })
  assert.equal(grassOnly.scenarios.worstCase.totalTriangles, 704834)
})

test('flat normals are unit length and colors stay low-saturation gray-brown', () => {
  const geometry = buildRockLiteGeometry()
  for (let offset = 0; offset < geometry.normals.length; offset += 3) {
    const length = Math.hypot(geometry.normals[offset], geometry.normals[offset + 1], geometry.normals[offset + 2])
    assert.ok(Math.abs(length - 1) < 1e-6, `normal length=${length}`)
  }
  for (let offset = 0; offset < geometry.colors.length; offset += 3) {
    const hsl = rgbToHsl(
      linearToSrgb(geometry.colors[offset]),
      linearToSrgb(geometry.colors[offset + 1]),
      linearToSrgb(geometry.colors[offset + 2]),
    )
    assert.ok(hsl.h >= 35 && hsl.h <= 55, `h=${hsl.h}`)
    assert.ok(hsl.s >= 8 && hsl.s <= 18, `s=${hsl.s}`)
    assert.ok(hsl.l >= 24 && hsl.l <= 36, `l=${hsl.l}`)
  }
})

test('--rock-lite combines with grassLite without changing either preset contract', async () => {
  assert.deepEqual(
    parseSceneTrisArgs(['--preset', 'base', '--grass-lite', '--rock-lite', '--out', 'out.json']),
    { preset: 'base', out: 'out.json', grassLite: true, rockLite: true },
  )
  const low = await buildSceneTrisReport('low', ROOT, { grassLite: true, rockLite: true })
  const base = await buildSceneTrisReport('base', ROOT, { grassLite: true, rockLite: true })
  assert.equal(low.inputs.foliage.totalInstances, 6000)
  assert.equal(low.inputs.rocks.totalInstances, 300)
  assert.equal(base.inputs.foliage.totalInstances, 20000)
  assert.equal(base.inputs.rocks.totalInstances, 600)
  assert.equal(low.inputs.rocks.rockLite.trianglesPerRock, 8)
  assert.equal(low.scenarios.worstCase.totalTriangles, 297634)
  assert.equal(low.scenarios.typical.totalTriangles, 295936)
  assert.equal(low.scenarios.worstCase.budget.status, 'pass')
  assert.equal(base.scenarios.worstCase.totalTriangles, 675234)
  assert.equal(base.scenarios.typical.totalTriangles, 673536)
  // R65-B §4-1 프리셋별: base tris limit is 1,100,000.
  assert.equal(base.scenarios.worstCase.budget.limit, 1100000)
  assert.equal(base.scenarios.worstCase.budget.status, 'pass')
  assert.equal(base.variant.grassLiteComparison.base.worstCaseTriangles, 704834)
})

test('CLI writes combined variant evidence without opening a browser', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'rock-lite-'))
  const out = join(temporary, 'report.json')
  try {
    const result = spawnSync(
      process.execPath,
      [SCENE_TRIS, '--preset', 'base', '--grass-lite', '--rock-lite', '--out', out],
      { cwd: ROOT, encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(report.variant.id, 'grassLite+rockLite')
    assert.equal(report.comparison.base.worstCaseTriangles, 675234)
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
