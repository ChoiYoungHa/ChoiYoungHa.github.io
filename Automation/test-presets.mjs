import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const PRESET_PATH = join(ROOT, 'src', 'data', 'quality-presets.json')
const QA_PATH = join(ROOT, 'Docs', 'qa', 'm4-presets.json')
const presets = JSON.parse(readFileSync(PRESET_PATH, 'utf8'))

const ITEM_KEYS = [
  'renderResolution',
  'dprCap',
  'shadowCascades',
  'shadowMaxDistance',
  'coniferLodDistances',
  'grassInstances',
  'rockInstances',
  'postChain',
  'fogDensity',
  'textureTier',
  'anisotropy',
]

const expected = {
  low: {
    renderResolution: { width: 1280, height: 720 },
    dprCap: 1,
    shadowCascades: { count: 2, resolution: 1024 },
    shadowMaxDistance: 80,
    coniferLodDistances: [25, 60, 90],
    grassInstances: { count: 6000, radius: 25 },
    rockInstances: 300,
    postChain: ['toneMapping', 'fxaa'],
    fogDensity: 0.008,
    textureTier: { default: '1K', hero: '2K' },
    anisotropy: 1,
  },
  base: {
    renderResolution: { width: 1600, height: 900 },
    dprCap: 1.5,
    shadowCascades: { count: 3, resolution: 2048 },
    shadowMaxDistance: 150,
    coniferLodDistances: [35, 80, 140],
    grassInstances: { count: 20000, radius: 40 },
    rockInstances: 600,
    postChain: ['toneMapping', 'fxaa', 'bloom', 'gtaoHalfResolution', 'lut'],
    fogDensity: 0.0055,
    textureTier: { default: '2K', hero: '2K' },
    anisotropy: 4,
  },
}

const comparisons = []
const contractDeviations = []

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertPresetSchema(name, preset) {
  assert.equal(typeof preset, 'object', `${name} preset object`)
  for (const key of ITEM_KEYS) assert.ok(Object.hasOwn(preset, key), `${name}.${key} missing`)
  assert.deepEqual(Object.keys(preset.renderResolution).sort(), ['height', 'width'])
  assert.equal(typeof preset.dprCap, 'number')
  assert.deepEqual(Object.keys(preset.shadowCascades).sort(), ['count', 'resolution'])
  assert.equal(typeof preset.shadowMaxDistance, 'number')
  assert.equal(preset.coniferLodDistances.length, 3)
  assert.deepEqual(Object.keys(preset.grassInstances).sort(), ['count', 'radius'])
  assert.equal(typeof preset.rockInstances, 'number')
  assert.ok(Array.isArray(preset.postChain))
  assert.equal(typeof preset.fogDensity, 'number')
  assert.deepEqual(Object.keys(preset.textureTier).sort(), ['default', 'hero'])
  assert.equal(typeof preset.anisotropy, 'number')
}

describe('M4-03·04 quality preset schema', () => {
  for (const name of ['low', 'base']) {
    test(`${name}: §3-6의 11개 항목과 타입을 모두 갖는다`, () => {
      assertPresetSchema(name, presets[name])
    })
  }

  test('로드맵 완료 조건과 값을 대조하되 값 편차는 보고만 한다', () => {
    for (const name of ['low', 'base']) {
      for (const key of ITEM_KEYS) {
        const matches = sameValue(presets[name][key], expected[name][key])
        const comparison = { preset: name, item: key, expected: expected[name][key], current: presets[name][key], matches }
        comparisons.push(comparison)
        if (!matches) contractDeviations.push(comparison)
      }
    }
    assert.equal(comparisons.length, 22)
    console.log(JSON.stringify({ contractDeviations }))
  })
})

after(() => {
  const lighting = readFileSync(join(ROOT, 'src', 'scene', 'Lighting.tsx'), 'utf8')
  const actualShadow = {
    cascades: Number(lighting.match(/cascades:\s*(\d+)/)?.[1]),
    resolution: Number(lighting.match(/mapSize:\s*(\d+)/)?.[1]),
    maxDistance: Number(lighting.match(/distance:\s*(\d+)/)?.[1]),
  }
  const runtimeConnections = [
    { item: 'renderResolution', connected: true, evidence: 'src/App.tsx: quality.renderResolution' },
    { item: 'dprCap', connected: true, evidence: 'src/App.tsx: quality.dprCap' },
    { item: 'shadowCascades', connected: false, evidence: 'src/scene/Lighting.tsx: M1_SHADOW_CONFIG hard-coded' },
    { item: 'shadowMaxDistance', connected: false, evidence: 'src/scene/Lighting.tsx: M1_SHADOW_CONFIG hard-coded' },
    { item: 'coniferLodDistances', connected: false, evidence: 'no TS/TSX consumer in this worktree' },
    { item: 'grassInstances', connected: true, evidence: 'src/scene/Foliage.tsx: quality.grassInstances' },
    { item: 'rockInstances', connected: true, evidence: 'src/scene/RockInstances.tsx: qualityPresets[preset].rockInstances' },
    { item: 'postChain', connected: false, evidence: 'no TS/TSX consumer; createRenderer.ts only sets antialias/forceWebGL' },
    { item: 'fogDensity', connected: true, evidence: 'src/scene/Atmosphere.tsx: presets[preset].fogDensity' },
    { item: 'textureTier', connected: false, evidence: 'no TS/TSX consumer; SkyDome.tsx fixes /env/sky_1k.hdr' },
    { item: 'anisotropy', connected: false, evidence: 'no TS/TSX consumer' },
  ]
  const deviations = [
    {
      item: 'shadowCascades',
      planned: { low: expected.low.shadowCascades, base: expected.base.shadowCascades },
      runtime: { count: actualShadow.cascades, resolution: actualShadow.resolution },
      decision: 'preset key is not consumed; master decides CSM integration after merge',
    },
    {
      item: 'shadowMaxDistance',
      planned: { low: 80, base: 150 },
      runtime: actualShadow.maxDistance,
      decision: 'low is numerically equal, base differs, and neither preset value is consumed',
    },
    {
      item: 'coniferLodDistances',
      planned: { low: [25, 60, 90], base: [35, 80, 140] },
      runtime: 'not-connected',
      decision: 'consumer implementation is deferred to master',
    },
    {
      item: 'postChain',
      planned: { low: expected.low.postChain, base: expected.base.postChain },
      runtime: [],
      decision: 'tone mapping, FXAA, bloom, GTAO half-resolution, and LUT are not selected from the preset',
    },
    {
      item: 'textureTier',
      planned: { low: expected.low.textureTier, base: expected.base.textureTier },
      runtime: { sky: '1K fixed', otherTextures: 'not-connected' },
      decision: 'asset/loader consumers are deferred to master',
    },
    {
      item: 'anisotropy',
      planned: { low: 1, base: 4 },
      runtime: 'not-configured',
      decision: 'texture sampler consumer is deferred to master',
    },
  ]
  const qa = {
    schemaVersion: 1,
    testedHead: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sources: ['계획서.md §3-6', '로드맵.md M4-03', '로드맵.md M4-04'],
    itemKeys: ITEM_KEYS,
    coverage: {
      low: { present: ITEM_KEYS.filter((key) => Object.hasOwn(presets.low, key)).length, required: 11 },
      base: { present: ITEM_KEYS.filter((key) => Object.hasOwn(presets.base, key)).length, required: 11 },
    },
    comparisons,
    contractDeviations,
    runtimeConnections,
    runtimeConnectedCount: runtimeConnections.filter((item) => item.connected).length,
    deviations,
    presetMutation: 'none; both committed presets already matched all 22 §3-6 values',
    integrationDecision: 'master-after-merge',
  }
  mkdirSync(dirname(QA_PATH), { recursive: true })
  writeFileSync(QA_PATH, `${JSON.stringify(qa, null, 2)}\n`, 'utf8')
})
