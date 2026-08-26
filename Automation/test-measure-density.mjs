import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { crc32, deflateSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MEASURE = join(ROOT, 'Automation', 'measure.mjs')
const { extractDensityStats, measureHeroSilhouette } = await import(new URL('./measure.mjs', import.meta.url).href)

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([length, typed, checksum])
}

function encodePng(width, height, pixel) {
  const channels = 3
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x++) {
      const rgb = pixel(x, y)
      raw.set(rgb, y * (stride + 1) + 1 + x * channels)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const WIDTH = 80
const HEIGHT = 64
const ROI = { left: 20, top: 8, right: 59, bottom: 55 }
const SKY = [140, 170, 200]
const TREE = [40, 65, 35]
const options = { roi: ROI, skyMargin: 8 }

const solidTree = (x, y) => x >= 30 && x <= 49 && y >= 20 && y <= 49
const branchedTree = (x, y) => {
  if (x >= 38 && x <= 41 && y >= 14 && y <= 52) return true
  return [18, 25, 32, 39, 46].some((branchY, index) =>
    y >= branchY && y <= branchY + 2 && x >= 27 - index && x <= 52 + index,
  )
}

describe('M5-13 hero silhouette boundary ratio', () => {
  test('solid rectangle has the exact 4-neighbour perimeter/mask ratio', () => {
    const png = encodePng(WIDTH, HEIGHT, (x, y) => solidTree(x, y) ? TREE : SKY)
    const result = measureHeroSilhouette(png, options)
    assert.equal(result.maskPixels, 600)
    assert.equal(result.boundaryPixels, 96)
    assert.equal(result.value, 0.16)
  })

  test('connected branches produce at least 2x the solid silhouette ratio', () => {
    const png = encodePng(WIDTH, HEIGHT, (x, y) => branchedTree(x, y) ? TREE : SKY)
    const result = measureHeroSilhouette(png, options)
    assert.ok(result.value >= 0.32, JSON.stringify(result))
    assert.ok(result.boundaryPixels > 96)
  })

  test('largest-component filtering ignores a disconnected dark cloud', () => {
    const png = encodePng(WIDTH, HEIGHT, (x, y) =>
      solidTree(x, y) || (x >= 22 && x <= 24 && y >= 10 && y <= 12) ? TREE : SKY,
    )
    const result = measureHeroSilhouette(png, options)
    assert.equal(result.maskPixels, 600)
    assert.deepEqual(result.maskBbox, { left: 30, top: 20, right: 49, bottom: 49 })
  })
})

describe('M5-13 density stats adapters and CLI', () => {
  test('reads renderer.info and derives scene-tris geometry kinds', () => {
    const renderer = extractDensityStats({ renderer: { info: { memory: { textures: 9, geometries: 12 } } } })
    assert.equal(renderer.textureCount.value, 9)
    assert.equal(renderer.meshKinds.value, 12)

    const sceneTris = JSON.parse(readFileSync(join(ROOT, 'Docs/perf/m4-scene-tris-grass-lite.json'), 'utf8'))
    const derived = extractDensityStats(sceneTris)
    assert.equal(derived.textureCount.value, null)
    assert.equal(derived.meshKinds.value, 16)
  })

  test('--capture/--stats writes asset-density/1 without changing legacy mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'measure-density-'))
    try {
      const capture = join(dir, 'capture.png')
      const stats = join(dir, 'stats.json')
      const out = join(dir, 'density.json')
      writeFileSync(capture, encodePng(WIDTH, HEIGHT, (x, y) => solidTree(x, y) ? TREE : SKY))
      writeFileSync(stats, JSON.stringify({ rendererInfo: { memory: { textures: 7, geometries: 9 } } }))
      const stdout = execFileSync(process.execPath, [MEASURE, '--capture', capture, '--stats', stats, '--out', out], {
        cwd: ROOT,
        encoding: 'utf8',
      })
      const result = JSON.parse(stdout)
      assert.deepEqual(result, JSON.parse(readFileSync(out, 'utf8')))
      assert.equal(result.schema, 'asset-density/1')
      assert.equal(result.checks.textureCount.pass, true)
      assert.equal(result.checks.meshKinds.pass, true)
      assert.equal(result.checks.heroSilhouetteRatio.pass, null)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
