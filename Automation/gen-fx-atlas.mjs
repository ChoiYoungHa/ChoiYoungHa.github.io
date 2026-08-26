import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

export const ATLAS_SIZE = 1024
export const CELL_SIZE = 256

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_OUTPUT = join(ROOT, 'public/textures/fx_atlas.png')
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ANTIALIAS_WIDTH_UV = 1.5 / CELL_SIZE

const clamp01 = (value) => Math.max(0, Math.min(1, value))
const edgeMask = (distance) => clamp01(0.5 - distance / (2 * ANTIALIAS_WIDTH_UV))

function rangeMask(value, minimum, maximum) {
  return Math.min(edgeMask(minimum - value), edgeMask(value - maximum))
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / lengthSquared)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function lineMask(x, y, ax, ay, bx, by, halfWidth) {
  return edgeMask(segmentDistance(x, y, ax, ay, bx, by) - halfWidth)
}

function color(red, green, blue, alpha) {
  return [red, green, blue, Math.round(255 * clamp01(alpha))]
}

function warriorSlash(column, x, y) {
  const frames = [
    { inner: 0.24, outer: 0.48, start: -2.0943951023931953, end: 0 },
    { inner: 0.29, outer: 0.47, start: -2.0943951023931953, end: 0 },
    { inner: 0.33, outer: 0.46, start: -2.0943951023931953, end: 0 },
  ]
  const frame = frames[column]
  const radius = Math.hypot(x, y)
  const angle = Math.atan2(y, x)
  const alpha = Math.min(
    rangeMask(radius, frame.inner, frame.outer),
    rangeMask(angle, frame.start, frame.end),
  )
  const heat = clamp01((radius - frame.inner) / (frame.outer - frame.inner))
  return color(224 + Math.round(31 * heat), 45 + Math.round(70 * heat), 28, alpha)
}

function warriorFire(x, y) {
  const vertical = rangeMask(y, -0.44, 0.42)
  const t = clamp01((y + 0.44) / 0.86)
  const width = 0.055 + 0.31 * Math.pow(Math.sin(Math.PI * t), 0.72)
  const body = Math.min(vertical, edgeMask(Math.abs(x) - width))
  const leftLobe = edgeMask(Math.hypot((x + 0.19) / 0.17, (y - 0.22) / 0.22) - 1)
  const rightLobe = edgeMask(Math.hypot((x - 0.19) / 0.17, (y - 0.25) / 0.19) - 1)
  const alpha = Math.max(body, leftLobe, rightLobe)
  const glow = clamp01((y + 0.44) / 0.86)
  return color(255, 218 - Math.round(105 * glow), 34 - Math.round(24 * glow), alpha)
}

function archerArrow(x, y) {
  const shaft = lineMask(x, y, -0.42, 0, 0.30, 0, 0.045)
  const upperHead = lineMask(x, y, 0.30, 0, 0.10, -0.18, 0.05)
  const lowerHead = lineMask(x, y, 0.30, 0, 0.10, 0.18, 0.05)
  const fletchingA = lineMask(x, y, -0.30, 0, -0.42, -0.13, 0.04)
  const fletchingB = lineMask(x, y, -0.30, 0, -0.42, 0.13, 0.04)
  return color(255, 248, 205, Math.max(shaft, upperHead, lowerHead, fletchingA, fletchingB))
}

function archerRibbon(column, x, y) {
  const phase = [0, 0.75, 1.5][column - 1]
  const center = 0.13 * Math.sin((x + 0.5) * Math.PI * 2.4 + phase)
  const halfWidth = [0.06, 0.05, 0.04][column - 1]
  const band = edgeMask(Math.abs(y - center) - halfWidth)
  const horizontal = rangeMask(x, -0.44, 0.44)
  return color(255, 255, 255, Math.min(band, horizontal))
}

function mageIcicle(x, y) {
  const vertical = rangeMask(y, -0.43, 0.43)
  const t = clamp01((y + 0.43) / 0.86)
  const halfWidth = 0.24 * (1 - t) + 0.025
  const body = Math.min(vertical, edgeMask(Math.abs(x) - halfWidth))
  const ridge = lineMask(x, y, 0, -0.36, 0, 0.24, 0.025)
  const alpha = Math.max(body, ridge)
  return color(188 - Math.round(55 * Math.abs(x)), 236, 255, alpha)
}

function mageFreezeMask(x, y) {
  const disc = edgeMask(Math.hypot(x, y) - 0.36)
  const innerCut = edgeMask(0.11 - Math.hypot(x, y))
  const spokes = Math.max(
    lineMask(x, y, -0.43, 0, 0.43, 0, 0.025),
    lineMask(x, y, 0, -0.43, 0, 0.43, 0.025),
    lineMask(x, y, -0.31, -0.31, 0.31, 0.31, 0.025),
    lineMask(x, y, -0.31, 0.31, 0.31, -0.31, 0.025),
  )
  return color(150, 225, 255, Math.max(disc * (1 - innerCut), spokes))
}

function diamondMask(x, y, centerX, centerY, radiusX, radiusY) {
  return edgeMask(Math.abs(x - centerX) / radiusX + Math.abs(y - centerY) / radiusY - 1)
}

function mageShards(column, x, y) {
  const shift = column === 2 ? -0.025 : 0.035
  const shards = [
    diamondMask(x, y, -0.27 + shift, -0.17, 0.12, 0.23),
    diamondMask(x, y, 0.03 + shift, 0.20, 0.10, 0.18),
    diamondMask(x, y, 0.27 + shift, -0.06, 0.11, 0.20),
    diamondMask(x, y, -0.17 + shift, 0.29, 0.07, 0.12),
  ]
  return color(192, 241, 255, Math.max(...shards))
}

function thiefSlash(direction, x, y) {
  const rising = lineMask(x, y, -0.40, 0.34, 0.40, -0.34, 0.065)
  const falling = lineMask(x, y, -0.40, -0.34, 0.40, 0.34, 0.065)
  const alpha = direction === 0 ? rising : falling
  const shimmer = clamp01(x + 0.5)
  return color(180 + Math.round(55 * shimmer), 105 + Math.round(70 * shimmer), 255, alpha)
}

function thiefCross(x, y) {
  const first = thiefSlash(0, x, y)
  const second = thiefSlash(1, x, y)
  return color(226, 174, 255, Math.max(first[3], second[3]) / 255)
}

function thiefRing(x, y) {
  const radius = Math.hypot(x, y)
  const ring = edgeMask(Math.abs(radius - 0.34) - 0.065)
  const rays = Math.max(
    lineMask(x, y, -0.42, 0, 0.42, 0, 0.018),
    lineMask(x, y, 0, -0.42, 0, 0.42, 0.018),
  )
  return color(211, 164, 255, Math.max(ring, rays))
}

function sampleCell(row, column, u, v) {
  const x = u - 0.5
  const y = v - 0.5
  if (row === 0) return column < 3 ? warriorSlash(column, x, y) : warriorFire(x, y)
  if (row === 1) return column === 0 ? archerArrow(x, y) : archerRibbon(column, x, y)
  if (row === 2) {
    if (column === 0) return mageIcicle(x, y)
    if (column === 1) return mageFreezeMask(x, y)
    return mageShards(column, x, y)
  }
  if (column < 2) return thiefSlash(column, x, y)
  return column === 2 ? thiefCross(x, y) : thiefRing(x, y)
}

export function buildFxAtlasPixels() {
  const pixels = Buffer.alloc(ATLAS_SIZE * ATLAS_SIZE * 4)
  for (let y = 0; y < ATLAS_SIZE; y += 1) {
    const row = Math.floor(y / CELL_SIZE)
    const v = (y % CELL_SIZE + 0.5) / CELL_SIZE
    for (let x = 0; x < ATLAS_SIZE; x += 1) {
      const column = Math.floor(x / CELL_SIZE)
      const u = (x % CELL_SIZE + 0.5) / CELL_SIZE
      const rgba = sampleCell(row, column, u, v)
      const offset = (y * ATLAS_SIZE + x) * 4
      pixels[offset] = rgba[0]
      pixels[offset + 1] = rgba[1]
      pixels[offset + 2] = rgba[2]
      pixels[offset + 3] = rgba[3]
    }
  }
  return pixels
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  return crc >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  typeBuffer.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8)
  return result
}

export function buildFxAtlasPng() {
  const pixels = buildFxAtlasPixels()
  const stride = ATLAS_SIZE * 4
  const raw = Buffer.alloc((stride + 1) * ATLAS_SIZE)
  for (let y = 0; y < ATLAS_SIZE; y += 1) {
    const rowOffset = y * (stride + 1)
    raw[rowOffset] = 0
    pixels.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(ATLAS_SIZE, 0)
  ihdr.writeUInt32BE(ATLAS_SIZE, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function coverageTable(pixels) {
  const rows = []
  for (let row = 0; row < 4; row += 1) {
    const values = []
    for (let column = 0; column < 4; column += 1) {
      let covered = 0
      for (let y = row * CELL_SIZE; y < (row + 1) * CELL_SIZE; y += 1) {
        for (let x = column * CELL_SIZE; x < (column + 1) * CELL_SIZE; x += 1) {
          if (pixels[(y * ATLAS_SIZE + x) * 4 + 3] >= 128) covered += 1
        }
      }
      values.push(Number((covered / (CELL_SIZE * CELL_SIZE)).toFixed(6)))
    }
    rows.push(values)
  }
  return rows
}

function parseOutput(args) {
  if (args.length === 0) return DEFAULT_OUTPUT
  if (args.length === 2 && args[0] === '--out') return resolve(args[1])
  throw new Error('usage: node Automation/gen-fx-atlas.mjs [--out <path>]')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = parseOutput(process.argv.slice(2))
  const pixels = buildFxAtlasPixels()
  const png = buildFxAtlasPng()
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, png)
  console.log(JSON.stringify({
    output,
    width: ATLAS_SIZE,
    height: ATLAS_SIZE,
    bytes: png.length,
    sha256: createHash('sha256').update(png).digest('hex'),
    alphaTestCoverage: coverageTable(pixels),
  }, null, 2))
}
