/** Three-independent procedural grass used only by the opt-in grassLite path. */

export const GRASS_LITE_SEED = 0x2026_0826
export const GRASS_LITE_COLOR_HSL = { h: 68, s: 24, l: 20 } as const

export interface GrassLiteGeometryData {
  seed: number
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  /** R75-C — 카드 텍스처용 UV(u 0→1 좌→우, v 0 뿌리→1 끝). 정점색 경로에선 무시된다. */
  uvs: Float32Array
  index: Uint16Array
  triangleCount: number
  bounds: { minY: number; maxY: number; radiusXZ: number }
  materialContract: { alpha: false; alphaTest: 0; blend: false; vertexColors: true }
}

/**
 * Three double-sided, tapered vertical quads: 3 planes × 2 sides × 2 tris.
 * The 0.23~0.27m height and ~0.38m maximum width follow the Kenney grass bounds;
 * every bottom vertex is y=0 so scatter placement keeps its ground pivot.
 */
export function buildGrassLiteGeometry(seed = GRASS_LITE_SEED): GrassLiteGeometryData {
  const random = mulberry32(seed >>> 0)
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const index: number[] = []

  for (let plane = 0; plane < 3; plane += 1) {
    const angle = plane * Math.PI / 3 + (random() - 0.5) * 0.12
    const axisX = Math.cos(angle)
    const axisZ = Math.sin(angle)
    const normalX = -axisZ
    const normalZ = axisX
    const halfBottom = 0.17 + random() * 0.025
    const halfTop = halfBottom * (0.28 + random() * 0.12)
    const height = 0.23 + random() * 0.04
    const lean = (random() - 0.5) * 0.025
    const lightness = 18 + random() * 4
    const srgb = hslToRgb(GRASS_LITE_COLOR_HSL.h, GRASS_LITE_COLOR_HSL.s, lightness)
    const linear = srgb.map(srgbToLinear)
    const points = [
      [-axisX * halfBottom, 0, -axisZ * halfBottom],
      [axisX * halfBottom, 0, axisZ * halfBottom],
      [normalX * lean + axisX * halfTop, height, normalZ * lean + axisZ * halfTop],
      [normalX * lean - axisX * halfTop, height, normalZ * lean - axisZ * halfTop],
    ]

    const front = positions.length / 3
    for (const point of points) pushVertex(positions, normals, colors, point, [normalX, 0, normalZ], linear)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    index.push(front, front + 1, front + 2, front, front + 2, front + 3)

    const back = positions.length / 3
    for (const point of points) pushVertex(positions, normals, colors, point, [-normalX, 0, -normalZ], linear)
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1)
    index.push(back, back + 2, back + 1, back, back + 3, back + 2)
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
    uvs: new Float32Array(uvs),
    index: new Uint16Array(index),
    triangleCount: index.length / 3,
    bounds: { minY, maxY, radiusXZ },
    materialContract: { alpha: false, alphaTest: 0, blend: false, vertexColors: true },
  }
}

function pushVertex(
  positions: number[],
  normals: number[],
  colors: number[],
  position: number[],
  normal: number[],
  color: number[],
): void {
  positions.push(...position)
  normals.push(...normal)
  colors.push(...color)
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
  if (s === 0) return [l, l, l]
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
