import { BufferGeometry, Color, Float32BufferAttribute } from 'three'
import { VILLAGE_COLORS } from './houseGeometry.ts'

export type RoofId = 'roof-a' | 'roof-b' | 'roof-c'

export const ROOF_METRICS = {
  'roof-a': { width: 6.6, depth: 5.6, rise: 1.5, pitchDeg: 24.4, silhouette: 'wide-gable' },
  'roof-b': { width: 5.6, depth: 7.6, rise: 2.8, pitchDeg: 45, silhouette: 'steep-gable' },
  'roof-c': { width: 4.2, depth: 4.2, rise: 2.6, pitchDeg: 51, silhouette: 'tower-hip' },
} as const

function makeGeometry(positions: number[], indices: number[]): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const color = new Color(VILLAGE_COLORS.roof)
  const colors = new Float32Array((positions.length / 3) * 3)
  for (let i = 0; i < positions.length / 3; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function gable(width: number, depth: number, rise: number): BufferGeometry {
  const x = width / 2
  const z = depth / 2
  return makeGeometry(
    [-x, 0, -z, x, 0, -z, 0, rise, -z, -x, 0, z, x, 0, z, 0, rise, z],
    [0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 2, 5, 4, 2, 4, 1, 0, 1, 4, 0, 4, 3],
  )
}

function hip(width: number, depth: number, rise: number): BufferGeometry {
  const x = width / 2
  const z = depth / 2
  return makeGeometry(
    [-x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z, 0, rise, 0],
    [0, 4, 1, 1, 4, 2, 2, 4, 3, 3, 4, 0, 0, 2, 3, 0, 1, 2],
  )
}

export function createRoofGeometry(id: RoofId): BufferGeometry {
  const metric = ROOF_METRICS[id]
  if (id === 'roof-c') return hip(metric.width, metric.depth, metric.rise)
  return gable(metric.width, metric.depth, metric.rise)
}
