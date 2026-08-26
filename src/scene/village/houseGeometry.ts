import { BoxGeometry, BufferAttribute, BufferGeometry, Color } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export type HouseId = 'house-a' | 'house-b' | 'house-c'

export const VILLAGE_COLORS = {
  wall: '#b5aa91',
  window: '#39434a',
  roof: '#704b38',
} as const

export interface RoofSocket {
  position: [number, number, number]
  rotationDeg: [number, number, number]
}

export const HOUSE_SOCKETS: Record<HouseId, RoofSocket> = {
  'house-a': { position: [0, 3, 0], rotationDeg: [0, 0, 0] },
  'house-b': { position: [0, 3.8, 0], rotationDeg: [0, 0, 0] },
  'house-c': { position: [0, 4.6, 0], rotationDeg: [0, 0, 0] },
}

function colorGeometry(geometry: BufferGeometry, hex: string): BufferGeometry {
  const color = new Color(hex)
  const position = geometry.getAttribute('position') as BufferAttribute
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

function box(
  size: [number, number, number],
  position: [number, number, number],
  color: string,
): BufferGeometry {
  const geometry = colorGeometry(new BoxGeometry(...size), color)
  geometry.translate(...position)
  return geometry
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  if (!geometry) throw new Error('house geometry merge failed')
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

/** 6×5m 기본형: 중앙문과 전면 창 2개. */
function houseA(): BufferGeometry {
  return merge([
    box([6, 3, 5], [0, 1.5, 0], VILLAGE_COLORS.wall),
    box([1.1, 2, 0.12], [0, 1, 2.56], VILLAGE_COLORS.window),
    box([1.2, 1, 0.12], [-1.8, 1.75, 2.56], VILLAGE_COLORS.window),
    box([1.2, 1, 0.12], [1.8, 1.75, 2.56], VILLAGE_COLORS.window),
  ])
}

/** 5×7m 세로형: A보다 높고 입구가 왼쪽이다. */
function houseB(): BufferGeometry {
  return merge([
    box([5, 3.8, 7], [0, 1.9, 0], VILLAGE_COLORS.wall),
    box([1.1, 2.1, 0.12], [-1.35, 1.05, 3.56], VILLAGE_COLORS.window),
    box([1.15, 1.15, 0.12], [0.55, 2.05, 3.56], VILLAGE_COLORS.window),
    box([1.15, 1.15, 0.12], [1.75, 2.05, 3.56], VILLAGE_COLORS.window),
  ])
}

/** L형: 주동과 오른쪽 날개를 겹쳐 내부 mesh 없이 외곽 실루엣만 만든다. */
function houseC(): BufferGeometry {
  return merge([
    box([6, 3.4, 4], [-1, 1.7, 0], VILLAGE_COLORS.wall),
    box([3, 4.6, 4], [2, 2.3, 1.5], VILLAGE_COLORS.wall),
    box([1.1, 2, 0.12], [-1.6, 1, 2.06], VILLAGE_COLORS.window),
    box([1.1, 1, 0.12], [0.2, 1.9, 2.06], VILLAGE_COLORS.window),
    box([1, 1.2, 0.12], [2, 2.4, 3.56], VILLAGE_COLORS.window),
  ])
}

export function createHouseGeometry(id: HouseId): BufferGeometry {
  if (id === 'house-a') return houseA()
  if (id === 'house-b') return houseB()
  return houseC()
}

export function triangleCount(geometry: BufferGeometry): number {
  const vertices = geometry.index?.count ?? geometry.getAttribute('position').count
  return vertices / 3
}
