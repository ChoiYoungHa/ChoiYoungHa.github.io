import dressing from '../../data/dressing.json' with { type: 'json' }
import type { Circle } from './heroTree'

/**
 * 2026-08-28 (룩 심사안 #8) — 코덱스 소품 원형 충돌체. dressing.json 의 collisionRadius > 0 인 소품만.
 * 플레이어 반경은 heroTree.resolveCollision 이 더한다(반경 = 소품 반경 + PLAYER_RADIUS 가 아니라 원 안 진입 금지 규칙).
 */
export interface DressingProp {
  kind: string
  position: [number, number]
  yaw: number
  scale: number
  collisionRadius: number
}

export const DRESSING_PROPS = dressing.props as DressingProp[]

const GROUND = dressing.ground
const DRESSING_CLEARANCE = 1.5

/** 광장·데크·텃밭·소품 주변이면 true — 식생 산포 제외용(순수). */
export function isDressingBlocked(x: number, z: number): boolean {
  for (const prop of DRESSING_PROPS) if (Math.hypot(x - prop.position[0], z - prop.position[1]) < DRESSING_CLEARANCE + prop.collisionRadius) return true
  const g = GROUND
  if (((x - g.plaza.center[0]) / (g.plaza.radiusX + 0.6)) ** 2 + ((z - g.plaza.center[1]) / (g.plaza.radiusZ + 0.6)) ** 2 < 1) return true
  if (Math.hypot(x - g.deck.center[0], z - g.deck.center[1]) < 2.8) return true
  if (Math.abs(x - g.farm.center[0]) < g.farm.size[0] / 2 + 0.6 && Math.abs(z - g.farm.center[1]) < g.farm.size[1] / 2 + 0.6) return true
  return false
}

export function dressingColliders(playerRadius: number): Circle[] {
  return DRESSING_PROPS
    .filter((p) => p.collisionRadius > 0)
    .map((p) => ({ x: p.position[0], z: p.position[1], radius: p.collisionRadius * p.scale + playerRadius }))
}
