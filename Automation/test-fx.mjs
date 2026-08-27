import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ATLAS = join(ROOT, 'public/textures/fx_atlas.png')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

function decodeRgbaPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  assert.deepEqual(buffer.subarray(0, 8), signature)

  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      assert.deepEqual([...data.subarray(8, 13)], [8, 6, 0, 0, 0])
    }
    if (type === 'IDAT') idat.push(data)
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1)
    assert.equal(raw[rowStart], 0, 'generator must use deterministic PNG filter 0')
    raw.copy(pixels, y * stride, rowStart + 1, rowStart + 1 + stride)
  }
  return { width, height, pixels }
}

function alphaCoverage(pixels, width, cellX, cellY, threshold = 128) {
  let covered = 0
  let positive = 0
  let antialiased = 0
  for (let y = cellY * 256; y < (cellY + 1) * 256; y += 1) {
    for (let x = cellX * 256; x < (cellX + 1) * 256; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3]
      if (alpha > 0) positive += 1
      if (alpha >= threshold) covered += 1
      if (alpha > 0 && alpha < 255) antialiased += 1
    }
  }
  return { coverage: covered / (256 * 256), cutoffRetention: covered / positive, antialiased }
}

function slashAngularSpanDegrees(pixels, width, cellX) {
  const angles = []
  for (let y = 0; y < 256; y += 1) {
    for (let x = cellX * 256; x < (cellX + 1) * 256; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue
      angles.push(Math.atan2(y + 0.5 - 128, x - cellX * 256 + 0.5 - 128))
    }
  }
  return (Math.max(...angles) - Math.min(...angles)) * 180 / Math.PI
}

test('VFX atlas is deterministic 1024² RGBA PNG under 1MB', async () => {
  const disk = await readFile(ATLAS)
  const { buildFxAtlasPng } = await load('Automation/gen-fx-atlas.mjs')
  const first = buildFxAtlasPng()
  const second = buildFxAtlasPng()

  assert.equal(disk.length <= 1_000_000, true, `${disk.length} bytes exceeds 1MB`)
  assert.deepEqual(first, second)
  assert.deepEqual(first, disk)
  assert.equal(
    createHash('sha256').update(first).digest('hex'),
    createHash('sha256').update(second).digest('hex'),
  )
  const decoded = decodeRgbaPng(disk)
  assert.deepEqual([decoded.width, decoded.height], [1024, 1024])
})

test('all 16 cells retain 5–60% coverage at alphaTest 0.5', async () => {
  const { width, pixels } = decodeRgbaPng(await readFile(ATLAS))
  const coverage = []
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const measured = alphaCoverage(pixels, width, column, row)
      coverage.push(measured.coverage)
      assert.equal(measured.coverage >= 0.05, true, `cell ${row},${column} is too sparse`)
      assert.equal(measured.coverage <= 0.60, true, `cell ${row},${column} is too dense`)
      assert.equal(measured.cutoffRetention >= 0.80, true, `cell ${row},${column} relies on translucency`)
    }
  }
  const ring = alphaCoverage(pixels, width, 3, 3)
  assert.equal(ring.antialiased > 0, true, 'shockwave ring must keep antialiased edges')
  assert.equal(coverage.length, 16)
  for (let column = 0; column < 3; column += 1) {
    const span = slashAngularSpanDegrees(pixels, width, column)
    assert.equal(span >= 118 && span <= 122, true, `warrior frame ${column} spans ${span}°`)
  }
})

test('fx.json fixes the basic attack plus four skill sequences and renderer handoff contract', async () => {
  const fx = JSON.parse(await readFile(join(ROOT, 'src/game/data/fx.json'), 'utf8'))
  assert.deepEqual(Object.keys(fx.skills), [
    'basic-attack',
    'flame-slash',
    'rainbow-shot',
    'ice-age',
    'leaping-slash',
  ])
  assert.deepEqual(
    [fx.atlas.width, fx.atlas.height, fx.atlas.columns, fx.atlas.rows, fx.atlas.cellSize, fx.atlas.alphaTest],
    [1024, 1024, 4, 4, 256, 0.5],
  )
  assert.equal(fx.maxConcurrent, 3)
  assert.deepEqual(fx.skills['flame-slash'].layers.map((layer) => layer.lifetimeMs), [600, 600])
  assert.equal(fx.skills['flame-slash'].layers[0].frameCount, 3)
  assert.equal(fx.skills['rainbow-shot'].projectileCount, 5)
  assert.equal(fx.skills['rainbow-shot'].instanceColors.length, 7)
  assert.equal(fx.skills['ice-age'].freezeDurationMs, 800)
  assert.equal(fx.skills['leaping-slash'].leapHeightMeters, 3)
  assert.equal(fx.skills['leaping-slash'].impactRadiusMeters, 2.5)
  assert.deepEqual(
    Object.values(fx.skills).map((skill) => skill.attachment),
    ['player-front', 'player-front', 'player-front', 'target-above', 'landing-point'],
  )
  assert.equal(fx.skills['flame-slash'].layers[1].attachment, 'impact-point')
  assert.equal(fx.skills['ice-age'].layers[2].attachment, 'target-body')
  assert.deepEqual(
    [fx.skills['ice-age'].layers[0].instanceCount, fx.skills['ice-age'].layers[0].instanceStaggerMs],
    [3, 100],
  )

  const usedRects = new Set()
  for (const skill of Object.values(fx.skills)) {
    assert.equal(skill.layers.length > 0, true)
    for (const layer of skill.layers) {
      assert.equal(layer.cellRects.length, layer.frameCount)
      assert.equal(layer.frameIntervalMs > 0, true)
      assert.equal(layer.lifetimeMs > 0, true)
      assert.equal(layer.scale.length, 2)
      for (const rect of layer.cellRects) {
        assert.equal(rect.length, 4)
        assert.equal(rect.every((value) => value >= 0 && value <= 1), true)
        usedRects.add(rect.join(','))
      }
    }
  }
  assert.equal(usedRects.size, 16, 'every generated atlas cell must belong to a sequence')
})

test('timeline frame boundaries are deterministic for basic attack and all four skills', async () => {
  const { sampleFx, spawnFx } = await load('src/game/rules/fxTimeline.ts')

  const flame = spawnFx('flame-slash', 1_000)
  assert.deepEqual(sampleFx(flame, 999), { active: false, elapsedMs: -1, layers: [] })
  assert.equal(sampleFx(flame, 1_000).layers[0].frameIndex, 0)
  assert.equal(sampleFx(flame, 1_180).layers[0].frameIndex, 1)
  assert.equal(sampleFx(flame, 1_360).layers[0].frameIndex, 2)
  assert.equal(sampleFx(flame, 1_599).layers[0].active, true)
  assert.equal(sampleFx(flame, 1_599).active, true)
  assert.equal(sampleFx(flame, 1_600).active, false)

  const basic = spawnFx('basic-attack', 1_000)
  assert.equal(sampleFx(basic, 1_599).layers[0].active, true)
  assert.equal(sampleFx(basic, 1_650).active, false)

  const rainbow = spawnFx('rainbow-shot', 2_000)
  assert.equal(sampleFx(rainbow, 2_089).layers[1].frameIndex, 0)
  assert.equal(sampleFx(rainbow, 2_090).layers[1].frameIndex, 1)
  assert.equal(sampleFx(rainbow, 2_180).layers[1].frameIndex, 2)
  assert.equal(sampleFx(rainbow, 2_540).active, false)

  const ice = spawnFx('ice-age', 3_000)
  assert.deepEqual(sampleFx(ice, 3_099).layers[0].instances.map((instance) => instance.active), [true, false, false])
  assert.deepEqual(sampleFx(ice, 3_100).layers[0].instances.map((instance) => instance.active), [true, true, false])
  assert.deepEqual(sampleFx(ice, 3_200).layers[0].instances.map((instance) => instance.active), [true, true, true])
  assert.deepEqual(sampleFx(ice, 3_400).layers[0].instances.map((instance) => instance.active), [false, false, true])
  assert.equal(sampleFx(ice, 3_300).layers[1].frameIndex, 0)
  assert.equal(sampleFx(ice, 3_400).layers[1].frameIndex, 1)
  assert.equal(sampleFx(ice, 4_099).active, true)
  assert.equal(sampleFx(ice, 4_100).active, false)

  const leap = spawnFx('leaping-slash', 4_000)
  assert.equal(sampleFx(leap, 4_299).layers.length, 0)
  assert.equal(sampleFx(leap, 4_300).layers[0].frameIndex, 0)
  assert.equal(sampleFx(leap, 4_400).layers[0].frameIndex, 1)
  assert.equal(sampleFx(leap, 4_500).layers[0].frameIndex, 2)
  assert.equal(sampleFx(leap, 4_899).active, true)
  assert.equal(sampleFx(leap, 4_900).active, false)
})

test('fourth concurrent FX request replaces the oldest of three pool slots', async () => {
  const { activeFx, createFxPool, enqueueFx } = await load('src/game/rules/fxTimeline.ts')
  let pool = createFxPool()
  for (const [index, skillId] of ['flame-slash', 'rainbow-shot', 'ice-age'].entries()) {
    const queued = enqueueFx(pool, skillId, 100 + index)
    pool = queued.pool
    assert.equal(queued.replaced, null)
  }

  const fourth = enqueueFx(pool, 'leaping-slash', 103)
  assert.equal(fourth.pool.capacity, 3)
  assert.equal(fourth.replaced.skillId, 'flame-slash')
  assert.deepEqual(activeFx(fourth.pool).map((fx) => fx.skillId), [
    'rainbow-shot',
    'ice-age',
    'leaping-slash',
  ])
})
