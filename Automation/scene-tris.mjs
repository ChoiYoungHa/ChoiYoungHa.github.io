#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PRESETS = new Set(['low', 'base'])
const TRIS_BUDGETS = Object.freeze({ low: 600_000, base: 1_100_000 })
const BUDGET_SOURCE = '계획서 §4-1'
const SCRIPT_PATH = fileURLToPath(import.meta.url)

export function parseSceneTrisArgs(args) {
  let preset
  let out
  let grassLite = false
  let rockLite = false
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]
    const value = args[index + 1]
    if (option === '--grass-lite') {
      grassLite = true
    } else if (option === '--rock-lite') {
      rockLite = true
    } else if (option === '--preset') {
      if (!value) throw new Error('--preset requires low or base')
      preset = value
      index += 1
    } else if (option === '--out') {
      if (!value) throw new Error('--out requires a path')
      out = value
      index += 1
    } else {
      throw new Error(`unknown option: ${option}`)
    }
  }
  if (!PRESETS.has(preset)) throw new Error('--preset must be low or base')
  if (!out) throw new Error('--out is required')
  return {
    preset,
    out,
    ...(grassLite ? { grassLite } : {}),
    ...(rockLite ? { rockLite } : {}),
  }
}

export async function buildSceneTrisReport(preset, root = resolve(dirname(SCRIPT_PATH), '..'), options = {}) {
  if (!PRESETS.has(preset)) throw new Error(`unsupported preset: ${preset}`)
  const shared = await loadSharedInputs(root)
  const presetInputs = {
    low: await loadPresetInputs(root, 'low', shared.assets),
    base: await loadPresetInputs(root, 'base', shared.assets),
  }
  const baselineReports = {
    low: buildPresetScenarios('low', shared, presetInputs.low),
    base: buildPresetScenarios('base', shared, presetInputs.base),
  }
  const grassRef = 'src/scene/foliage/grassLiteGeometry.ts'
  const rockRef = 'src/scene/foliage/rockLiteGeometry.ts'
  const [grassModule, rockModule] = await Promise.all([
    import(pathToFileURL(resolve(root, grassRef)).href),
    import(pathToFileURL(resolve(root, rockRef)).href),
  ])
  const grassGeometry = grassModule.buildGrassLiteGeometry()
  const rockGeometry = rockModule.buildRockLiteGeometry()
  const grassInputs = mapPresetInputs(presetInputs, (input) => applyGrassLite(input, grassGeometry, grassRef))
  const rockInputs = mapPresetInputs(presetInputs, (input) => applyRockLite(input, rockGeometry, rockRef))
  const comboInputs = mapPresetInputs(grassInputs, (input) => applyRockLite(input, rockGeometry, rockRef))
  const reportSets = {
    baseline: baselineReports,
    'grass-lite': buildReports(shared, grassInputs),
    'rock-lite': buildReports(shared, rockInputs),
    combo: buildReports(shared, comboInputs),
  }
  const activeVariant = variantName(options)
  const reports = reportSets[activeVariant]
  const grassMetadata = {
    id: 'grassLite',
    source: grassRef,
    seed: grassGeometry.seed,
    trianglesPerGrass: grassGeometry.triangleCount,
    bounds: grassGeometry.bounds,
  }
  const rockMetadata = {
    id: 'rockLite',
    source: rockRef,
    seed: rockGeometry.seed,
    trianglesPerRock: rockGeometry.triangleCount,
    bounds: rockGeometry.bounds,
  }
  const activeMetadata = activeVariant === 'grass-lite'
    ? [grassMetadata]
    : activeVariant === 'rock-lite'
      ? [rockMetadata]
      : activeVariant === 'combo'
        ? [grassMetadata, rockMetadata]
        : []
  const variant = activeMetadata.length > 0 ? {
    id: activeMetadata.map(({ id }) => id).join('+'),
    enabled: true,
    ...(activeMetadata.length === 1
      ? activeMetadata[0]
      : { features: Object.fromEntries(activeMetadata.map(({ id, ...metadata }) => [id, metadata])) }),
    baselineComparison: buildComparison(reportSets.baseline),
    ...(activeVariant === 'combo' ? { grassLiteComparison: buildComparison(reportSets['grass-lite']) } : {}),
  } : undefined
  const directGenerators = activeMetadata.map((metadata) => ({
    ref: metadata.source,
    values: metadata.id === 'grassLite'
      ? { trianglesPerGrass: metadata.trianglesPerGrass, seed: metadata.seed }
      : { trianglesPerRock: metadata.trianglesPerRock, seed: metadata.seed },
  }))
  const selected = reports[preset]

  return {
    schema: 'scene-tris/1',
    buildHash: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    preset,
    budgetLimitTriangles: budgetLimitForPreset(preset),
    source: BUDGET_SOURCE,
    method: 'source-derived conservative scene submission count; no renderer.info dependency',
    outputContract: {
      pattern: 'Docs/perf/m4-scene-tris-<variant>.json',
      variant: activeVariant,
      recommendedFile: `Docs/perf/m4-scene-tris-${activeVariant}.json`,
    },
    variantSummary: buildVariantSummary(reportSets),
    ...(variant ? { variant } : {}),
    inputs: selected.inputs,
    scenarios: selected.scenarios,
    comparison: buildComparison(reports),
    sourceSummary: variant ? {
      ...shared.sourceSummary,
      directGenerator: [
        ...shared.sourceSummary.directGenerator,
        ...directGenerators,
      ],
    } : shared.sourceSummary,
    limitations: [
      'Worst case and typical both conservatively retain all 16 terrain chunks, path, village, foliage, and rocks; typical changes only the hero tree to LOD1.',
      'No camera pose was supplied for a reproducible frustum/instance visibility reduction, so this report does not claim a lower on-screen count.',
      variant
        ? `${activeVariant === 'grass-lite' || activeVariant === 'combo' ? 'grass uses grassLite; ' : ''}${activeVariant === 'rock-lite' || activeVariant === 'combo' ? 'rocks use rockLite; ' : ''}remaining GLB species use ledger values cross-checked against their binaries.`
        : 'GLB per-species triangles come from the 19-column asset ledger; procedural hero triangles are executed directly from the pure generator.',
    ],
  }
}

async function loadSharedInputs(root) {
  const refs = {
    terrain: 'src/scene/Terrain.tsx',
    path: 'src/scene/MainPath.tsx',
    hero: 'src/scene/hero/heroTreeGeometry.ts',
    heroQa: 'Docs/qa/m2-herotree.json',
    villageQa: 'Docs/qa/m2-house-a.json',
    placement: 'src/data/placement.json',
    assets: 'src/data/assets.csv',
  }
  const [terrainSource, pathSource, heroQa, villageQa, placement, assets] = await Promise.all([
    readFile(resolve(root, refs.terrain), 'utf8'),
    readFile(resolve(root, refs.path), 'utf8'),
    readJson(resolve(root, refs.heroQa)),
    readJson(resolve(root, refs.villageQa)),
    readJson(resolve(root, refs.placement)),
    readAssets(resolve(root, refs.assets)),
  ])

  const terrainChunks = sourceInteger(terrainSource, /export const TERRAIN_CHUNKS\s*=\s*(\d+)/u, 'TERRAIN_CHUNKS')
  const segmentsPerChunk = sourceInteger(terrainSource, /export const SEGMENTS_PER_CHUNK\s*=\s*(\d+)/u, 'SEGMENTS_PER_CHUNK')
  const pathSamples = sourceInteger(pathSource, /const SAMPLES\s*=\s*(\d+)/u, 'SAMPLES')
  const heroModule = await import(pathToFileURL(resolve(root, refs.hero)).href)
  const heroLod0 = heroModule.buildHeroTree(0).triangleCount
  const heroLod1 = heroModule.buildHeroTree(1).triangleCount
  if (heroLod0 !== heroQa.lod0.triangleCount || heroLod1 !== heroQa.lod1.triangleCount) {
    throw new Error(`hero generator/QA mismatch: ${heroLod0}/${heroLod1}`)
  }

  const houseTris = Object.fromEntries(villageQa.houses.map(({ id, tris }) => [id, tris]))
  const roofTris = Object.fromEntries(villageQa.roofs.map(({ id, tris }) => [id, tris]))
  const villageCounts = countBy(placement.village, 'house')
  const roofCounts = countBy(placement.village, 'roof')
  const villageTriangles = sumEntries(villageCounts, houseTris) + sumEntries(roofCounts, roofTris)

  return {
    terrain: {
      chunks: terrainChunks,
      segmentsPerChunk,
      triangleCount: terrainChunks * terrainChunks * segmentsPerChunk * segmentsPerChunk * 2,
    },
    mainPath: { samples: pathSamples, triangleCount: (pathSamples - 1) * 2 },
    heroTree: { lod0Triangles: heroLod0, lod1Triangles: heroLod1 },
    village: {
      buildingCount: placement.village.length,
      houseCounts: villageCounts,
      roofCounts,
      houseTrianglesByVariant: houseTris,
      roofTrianglesByVariant: roofTris,
      triangleCount: villageTriangles,
    },
    assets,
    refs,
    sourceSummary: {
      directGenerator: [{ ref: refs.hero, values: { lod0: heroLod0, lod1: heroLod1 } }],
      sourceFormula: [
        { ref: refs.terrain, formula: 'chunks² × segments² × 2' },
        { ref: refs.path, formula: '(samples - 1) × 2' },
      ],
      qaJson: [
        { ref: refs.heroQa, role: 'generator cross-check' },
        { ref: refs.villageQa, role: 'house/roof variant triangles' },
      ],
      assetsCsv: [
        { ref: refs.assets, role: 'foliage per-species tris_lod0' },
        { ref: refs.assets, role: 'rock per-species tris_lod0' },
      ],
      glbBinary: [
        { ref: 'public/models/vegetation_kit.glb', role: 'ledger triangle sum cross-check' },
        { ref: 'public/models/props_rocks.glb', role: 'ledger triangle sum cross-check' },
      ],
    },
  }
}

async function loadPresetInputs(root, preset, assets) {
  const qualityRef = 'src/data/quality-presets.json'
  const foliageRef = 'src/scene/Foliage.tsx'
  const rocksRef = 'src/scene/RockInstances.tsx'
  const [quality, foliageSource, rocksSource] = await Promise.all([
    readJson(resolve(root, qualityRef)),
    readFile(resolve(root, foliageRef), 'utf8'),
    readFile(resolve(root, rocksRef), 'utf8'),
  ])
  assertSourcePolicy(foliageSource, [
    "const SPECIES = ['grass', 'flower_yellowA', 'plant_bush']",
    'Math.floor(total * 0.7)',
    'Math.floor(total * 0.2)',
  ], foliageRef)
  assertSourcePolicy(rocksSource, [
    "const SPECIES = ['rock_smallA', 'rock_smallFlatA', 'rock_tallA']",
    'Math.floor(total / 3)',
  ], rocksRef)

  const foliageTotal = quality[preset].grassInstances.count
  const foliageCounts = [Math.floor(foliageTotal * 0.7), Math.floor(foliageTotal * 0.2)]
  foliageCounts.push(foliageTotal - foliageCounts[0] - foliageCounts[1])
  const foliageIds = [
    ['grass', 'asset.env.vegetation.grass.a'],
    ['flower_yellowA', 'asset.env.vegetation.flower.a'],
    ['plant_bush', 'asset.env.vegetation.shrub.a'],
  ]

  const rockTotal = quality[preset].rockInstances
  const rockCounts = [Math.floor(rockTotal / 3), Math.floor(rockTotal / 3)]
  rockCounts.push(rockTotal - rockCounts[0] - rockCounts[1])
  const rockIds = [
    ['rock_smallA', 'asset.env.rock.a'],
    ['rock_smallFlatA', 'asset.env.rock.b'],
    ['rock_tallA', 'asset.env.rock.c'],
  ]

  const foliage = instanceInput(foliageIds, foliageCounts, assets, foliageTotal, {
      radius: quality[preset].grassInstances.radius,
      refs: `${qualityRef} + ${foliageRef} + src/data/assets.csv`,
    })
  const rocks = instanceInput(rockIds, rockCounts, assets, rockTotal, {
      maxDistance: quality[preset].rockDrawDistance,
      refs: `${qualityRef} + ${rocksRef} + src/data/assets.csv`,
    })
  foliage.runtimeGlb = await glbLedgerCrossCheck(root, foliageIds, assets)
  rocks.runtimeGlb = await glbLedgerCrossCheck(root, rockIds, assets)
  return { foliage, rocks }
}

function mapPresetInputs(inputs, transform) {
  return {
    low: transform(inputs.low),
    base: transform(inputs.base),
  }
}

function buildReports(shared, inputs) {
  return {
    low: buildPresetScenarios('low', shared, inputs.low),
    base: buildPresetScenarios('base', shared, inputs.base),
  }
}

function variantName(options) {
  if (options.grassLite && options.rockLite) return 'combo'
  if (options.grassLite) return 'grass-lite'
  if (options.rockLite) return 'rock-lite'
  return 'baseline'
}

function budgetLimitForPreset(preset) {
  const limit = TRIS_BUDGETS[preset]
  if (!Number.isInteger(limit)) throw new Error(`missing tris budget for preset: ${preset}`)
  return limit
}

function buildPresetScenarios(preset, shared, presetInputs) {
  const staticInputs = {
    terrain: shared.terrain,
    mainPath: shared.mainPath,
    heroTree: shared.heroTree,
    village: shared.village,
  }
  const inputs = { ...staticInputs, foliage: presetInputs.foliage, rocks: presetInputs.rocks }
  const common = {
    terrain: component(shared.terrain.triangleCount, 'source-formula', shared.refs.terrain),
    mainPath: component(shared.mainPath.triangleCount, 'source-formula', shared.refs.path),
    village: component(shared.village.triangleCount, 'qa-json+placement', `${shared.refs.villageQa} + ${shared.refs.placement}`),
    foliageInstances: component(
      presetInputs.foliage.triangleCount,
      presetInputs.foliage.grassLite ? 'direct-generator+assets-csv+runtime-policy' : 'assets-csv+glb-total+runtime-policy',
      presetInputs.foliage.refs,
    ),
    rockInstances: component(
      presetInputs.rocks.triangleCount,
      presetInputs.rocks.rockLite ? 'direct-generator+runtime-policy' : 'assets-csv+glb-total+runtime-policy',
      presetInputs.rocks.refs,
    ),
  }
  const worst = scenario(preset, 'worstCase', {
    ...common,
    heroTree: component(shared.heroTree.lod0Triangles, 'direct-generator', shared.refs.hero),
  }, [
    'hero tree LOD0',
    `all ${presetInputs.foliage.totalInstances} foliage and ${presetInputs.rocks.totalInstances} rocks visible; grass=${presetInputs.foliage.grassLite ? 'procedural grassLite' : 'current GLB LOD0'}; rocks=${presetInputs.rocks.rockLite ? 'procedural rockLite' : 'current GLB LOD0'}`,
    'all 16 terrain chunks, path, and 8 village buildings retained',
  ])
  const typical = scenario(preset, 'typical', {
    ...common,
    heroTree: component(shared.heroTree.lod1Triangles, 'direct-generator', shared.refs.hero),
  }, [
    'hero tree LOD1',
    `${presetInputs.foliage.totalInstances} foliage within preset radius and all preset-capped rocks retained conservatively`,
    'all 16 terrain chunks, path, and 8 village buildings retained because no fixed camera-frustum contract was supplied',
  ])
  return { preset, inputs, scenarios: { worstCase: worst, typical } }
}

function applyGrassLite(presetInput, geometry, generatorRef) {
  const foliage = presetInput.foliage
  const counts = foliage.countsBySpecies
  const trianglesEach = { ...foliage.trianglesEach, grass: geometry.triangleCount }
  const trianglesBySpecies = Object.fromEntries(
    Object.entries(counts).map(([species, count]) => [species, count * trianglesEach[species]]),
  )
  return {
    ...presetInput,
    foliage: {
      ...foliage,
      trianglesEach,
      trianglesBySpecies,
      triangleCount: Object.values(trianglesBySpecies).reduce((sum, value) => sum + value, 0),
      refs: `${foliage.refs} + ${generatorRef}`,
      grassLite: {
        enabled: true,
        seed: geometry.seed,
        trianglesPerGrass: geometry.triangleCount,
        bounds: geometry.bounds,
      },
    },
  }
}

function applyRockLite(presetInput, geometry, generatorRef) {
  const rocks = presetInput.rocks
  const counts = rocks.countsBySpecies
  const trianglesEach = Object.fromEntries(Object.keys(counts).map((species) => [species, geometry.triangleCount]))
  const trianglesBySpecies = Object.fromEntries(
    Object.entries(counts).map(([species, count]) => [species, count * trianglesEach[species]]),
  )
  return {
    ...presetInput,
    rocks: {
      ...rocks,
      trianglesEach,
      trianglesBySpecies,
      triangleCount: Object.values(trianglesBySpecies).reduce((sum, value) => sum + value, 0),
      refs: `${rocks.refs} + ${generatorRef}`,
      rockLite: {
        enabled: true,
        seed: geometry.seed,
        trianglesPerRock: geometry.triangleCount,
        bounds: geometry.bounds,
      },
    },
  }
}

function buildComparison(reports) {
  return Object.fromEntries(
    Object.entries(reports).map(([name, report]) => [name, {
      worstCaseTriangles: report.scenarios.worstCase.totalTriangles,
      typicalTriangles: report.scenarios.typical.totalTriangles,
      budgetStatus: report.scenarios.worstCase.budget.status,
      worstCaseComponentRatiosPct: Object.fromEntries(
        Object.entries(report.scenarios.worstCase.components).map(([componentName, value]) => [componentName, value.ratioPct]),
      ),
    }]),
  )
}

function buildVariantSummary(reportSets) {
  return Object.entries(reportSets).map(([variant, reports]) => ({
    variant,
    low: summaryRow(reports.low),
    base: summaryRow(reports.base),
  }))
}

function summaryRow(report) {
  return {
    worstCaseTriangles: report.scenarios.worstCase.totalTriangles,
    typicalTriangles: report.scenarios.typical.totalTriangles,
    limit: report.scenarios.worstCase.budget.limit,
    status: report.scenarios.worstCase.budget.status,
  }
}

function scenario(preset, id, rawComponents, assumptions) {
  const totalTriangles = Object.values(rawComponents).reduce((total, item) => total + item.triangles, 0)
  const limit = budgetLimitForPreset(preset)
  const components = Object.fromEntries(
    Object.entries(rawComponents).map(([name, item]) => [name, {
      ...item,
      ratioPct: round(item.triangles / totalTriangles * 100, 6),
    }]),
  )
  return {
    id,
    assumptions,
    components,
    totalTriangles,
    budget: {
      limit,
      source: BUDGET_SOURCE,
      status: totalTriangles <= limit ? 'pass' : 'fail',
      headroom: limit - totalTriangles,
      overBy: Math.max(0, totalTriangles - limit),
    },
  }
}

function component(triangles, method, ref) {
  return { triangles, source: { method, ref } }
}

function instanceInput(speciesAndIds, counts, assets, totalInstances, extra) {
  const countsBySpecies = {}
  const trianglesEach = {}
  const trianglesBySpecies = {}
  for (let index = 0; index < speciesAndIds.length; index += 1) {
    const [species, assetId] = speciesAndIds[index]
    const asset = assets.get(assetId)
    if (!asset) throw new Error(`missing asset ledger row: ${assetId}`)
    const tris = Number(asset.tris_lod0)
    if (!Number.isInteger(tris) || tris < 0) throw new Error(`invalid tris_lod0 for ${assetId}`)
    countsBySpecies[species] = counts[index]
    trianglesEach[species] = tris
    trianglesBySpecies[species] = counts[index] * tris
  }
  return {
    totalInstances,
    countsBySpecies,
    trianglesEach,
    trianglesBySpecies,
    triangleCount: Object.values(trianglesBySpecies).reduce((sum, value) => sum + value, 0),
    ...extra,
  }
}

async function glbLedgerCrossCheck(root, speciesAndIds, assets) {
  const rows = speciesAndIds.map(([, assetId]) => assets.get(assetId))
  if (rows.some((row) => !row)) throw new Error('missing asset row for GLB cross-check')
  const runtimeFiles = [...new Set(rows.map((row) => row.runtime_file))]
  if (runtimeFiles.length !== 1) throw new Error(`expected one shared runtime GLB, got ${runtimeFiles.join(', ')}`)
  const ledgerTriangles = rows.reduce((sum, row) => sum + Number(row.tris_lod0), 0)
  const stats = await readGlbStats(resolve(root, runtimeFiles[0]))
  if (stats.totalTriangles !== ledgerTriangles) {
    throw new Error(`${runtimeFiles[0]} triangle mismatch: GLB=${stats.totalTriangles}, ledger=${ledgerTriangles}`)
  }
  return {
    ref: runtimeFiles[0],
    bytes: stats.bytes,
    totalTriangles: stats.totalTriangles,
    ledgerTriangles,
    matchesLedger: true,
    meshNames: stats.meshNames,
  }
}

async function readGlbStats(path) {
  const buffer = await readFile(path)
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error(`invalid GLB: ${path}`)
  if (buffer.readUInt32LE(4) !== 2) throw new Error(`unsupported GLB version: ${path}`)
  let offset = 12
  let json
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset)
    const type = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + length
    if (end > buffer.length) throw new Error(`truncated GLB chunk: ${path}`)
    if (type === 0x4e4f534a) {
      json = JSON.parse(buffer.toString('utf8', start, end).replace(/\0+$/u, '').trim())
      break
    }
    offset = end
  }
  if (!json) throw new Error(`missing GLB JSON chunk: ${path}`)

  let totalTriangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
      const count = json.accessors?.[accessorIndex]?.count
      if (!Number.isFinite(count)) throw new Error(`missing GLB accessor count: ${path}`)
      const mode = primitive.mode ?? 4
      if (mode === 4) totalTriangles += Math.floor(count / 3)
      else if (mode === 5 || mode === 6) totalTriangles += Math.max(0, count - 2)
      else throw new Error(`unsupported GLB primitive mode ${mode}: ${path}`)
    }
  }
  return { bytes: buffer.length, totalTriangles, meshNames: (json.meshes ?? []).map((mesh) => mesh.name ?? '') }
}

async function readAssets(path) {
  const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/u, '').trimEnd()
  const [headerLine, ...lines] = text.split(/\r?\n/u)
  const headers = parseCsvLine(headerLine)
  if (headers.length !== 19) throw new Error(`assets.csv header has ${headers.length} columns, expected 19`)
  const rows = new Map()
  for (const line of lines) {
    if (!line) continue
    const values = parseCsvLine(line)
    if (values.length !== headers.length) throw new Error(`assets.csv row has ${values.length} columns: ${line}`)
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]))
    rows.set(row.asset_id, row)
  }
  return rows
}

function parseCsvLine(line) {
  const cells = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  if (quoted) throw new Error('unterminated CSV quote')
  cells.push(cell)
  return cells
}

function countBy(entries, key) {
  const counts = {}
  for (const entry of entries) counts[entry[key]] = (counts[entry[key]] ?? 0) + 1
  return counts
}

function sumEntries(counts, triangles) {
  return Object.entries(counts).reduce((sum, [id, count]) => {
    if (!Number.isFinite(triangles[id])) throw new Error(`missing triangle count: ${id}`)
    return sum + count * triangles[id]
  }, 0)
}

function sourceInteger(source, pattern, label) {
  const match = source.match(pattern)
  if (!match) throw new Error(`could not read ${label} from source`)
  return Number(match[1])
}

function assertSourcePolicy(source, fragments, ref) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) throw new Error(`${ref} policy drift: missing ${fragment}`)
  }
}

async function readJson(path) {
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''))
}

function round(value, digits) {
  return Number(value.toFixed(digits))
}

function repoPath(root, path) {
  return relative(root, path).replaceAll('\\', '/')
}

async function main() {
  let args
  try {
    args = parseSceneTrisArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`error: ${error.message}\nusage: node Automation/scene-tris.mjs --preset low|base [--grass-lite] [--rock-lite] --out <json>\n`)
    process.exitCode = 2
    return
  }
  const root = resolve(dirname(SCRIPT_PATH), '..')
  const report = await buildSceneTrisReport(args.preset, root, {
    grassLite: args.grassLite === true,
    rockLite: args.rockLite === true,
  })
  const outPath = resolve(root, args.out)
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(
    `preset=${args.preset} worst=${report.scenarios.worstCase.totalTriangles} typical=${report.scenarios.typical.totalTriangles} budget=${report.scenarios.worstCase.budget.status} out=${repoPath(root, outPath)}\n`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(SCRIPT_PATH)) {
  await main()
}
