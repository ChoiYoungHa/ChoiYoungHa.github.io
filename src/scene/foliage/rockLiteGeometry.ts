/** Three-independent procedural rock used only by the opt-in rockLite path. */

export const ROCK_LITE_SEED = 0x2026_0826
export const ROCK_LITE_COLOR_HSL = { h: 44, s: 14, l: 30 } as const

export interface RockLiteGeometryData {
  seed: number
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  index: Uint16Array
  triangleCount: number
  bounds: { minY: number; maxY: number; radiusXZ: number }
  materialContract: { alpha: false; alphaTest: 0; blend: false; vertexColors: true }
}

/**
 * An irregular octahedron with four upper and four lower faces (8 tris total).
 * Faces own their vertices so their flat normals and subtle gray-brown colors
 * survive the existing vertex-color lookdev material without a new shader path.
 */
export function buildRockLiteGeometry(seed = ROCK_LITE_SEED): RockLiteGeometryData {
  const random = mulberry32(seed >>> 0)
  const rotation = random() * Math.PI * 2
  const radiusX = 0.29 + random() * 0.09
  const radiusZ = 0.27 + random() * 0.09
  const ringY = 0.14 + random() * 0.07
  const height = 0.4 + random() * 0.16
  const bottom: Point = [0, 0, 0]
  const top: Point = [(random() - 0.5) * 0.07, height, (random() - 0.5) * 0.07]
  const ring = Array.from({ length: 4 }, (_, index): Point => {
    const angle = rotation + index * Math.PI / 2
    const radiusVariation = 0.88 + random() * 0.2
    return [
      Math.cos(angle) * radiusX * radiusVariation,
      ringY * (0.9 + random() * 0.2),
      Math.sin(angle) * radiusZ * radiusVariation,
    ]
  })

  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const index: number[] = []

  for (let face = 0; face < 4; face += 1) {
    const next = (face + 1) % 4
    pushFace(positions, normals, colors, index, [top, ring[next], ring[face]], random)
    pushFace(positions, normals, colors, index, [bottom, ring[face], ring[next]], random)
  }

  let minY = Infinity
  let maxY = -Infinity
  let radiusXZ = 0
  for (let offset = 0; offset < positions.length; offset += 3) {
    minY = Math.min(minY, positions[offset + 1])
    maxY = Math.max(maxY, positions[offset + 1])
    radiusXZ = Math.max(radiusXZ, Math.hypot(positions[offset], positions[offset + 2]))
  }

  return {
    seed: seed >>> 0,
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    index: new Uint16Array(index),
    triangleCount: index.length / 3,
    bounds: { minY, maxY, radiusXZ },
    materialContract: { alpha: false, alphaTest: 0, blend: false, vertexColors: true },
  }
}

type Point = [x: number, y: number, z: number]

function pushFace(
  positions: number[],
  normals: number[],
  colors: number[],
  index: number[],
  points: [Point, Point, Point],
  random: () => number,
): void {
  const normal = faceNormal(points)
  const hue = ROCK_LITE_COLOR_HSL.h + (random() - 0.5) * 8
  const saturation = ROCK_LITE_COLOR_HSL.s + (random() - 0.5) * 6
  const lightness = ROCK_LITE_COLOR_HSL.l + (random() - 0.5) * 8
  const color = hslToRgb(hue, saturation, lightness).map(srgbToLinear)
  const first = positions.length / 3
  for (const point of points) {
    positions.push(...point)
    normals.push(...normal)
    colors.push(...color)
  }
  index.push(first, first + 1, first + 2)
}

function faceNormal([a, b, c]: [Point, Point, Point]): Point {
  const ab: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac: Point = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cross: Point = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ]
  const length = Math.hypot(...cross)
  return [cross[0] / length, cross[1] / length, cross[2] / length]
}

function mulberry32(seed: number): () => number {
  return () => {
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function hslToRgb(hueDeg: number, saturationPct: number, lightnessPct: number): number[] {
  const h = ((hueDeg % 360) + 360) % 360 / 360
  const s = saturationPct / 100
  const l = lightnessPct / 100
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

function hueToRgb(p: number, q: number, rawT: number): number {
  let t = rawT
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}
