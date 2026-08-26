import placement from '../../data/placement.json' with { type: 'json' }
import mainPath from '../../data/main-path.json' with { type: 'json' }
import { distanceToCenterline } from '../scatter/exclusionMask.ts'
import type { HouseId } from '../village/houseGeometry.ts'

export interface VillagePosition {
  x: number
  y?: number
  z: number
}

export interface VillageCollider {
  buildingId: string
  x: number
  z: number
  halfX: number
  halfZ: number
  rotationY: number
}

interface LocalBox {
  x: number
  z: number
  halfX: number
  halfZ: number
}

const LOCAL_BOXES: Record<HouseId, LocalBox[]> = {
  'house-a': [{ x: 0, z: 0, halfX: 3, halfZ: 2.5 }],
  'house-b': [{ x: 0, z: 0, halfX: 2.5, halfZ: 3.5 }],
  'house-c': [
    { x: -1, z: 0, halfX: 3, halfZ: 2 },
    { x: 2, z: 1.5, halfX: 1.5, halfZ: 2 },
  ],
}

const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))

export function createVillageColliders(): VillageCollider[] {
  return placement.village.flatMap((building) => {
    const angle = (building.rotationYDeg * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    return LOCAL_BOXES[building.house as HouseId].map((box) => ({
      buildingId: building.id,
      x: building.position[0] + (box.x * cos - box.z * sin) * building.scale,
      z: building.position[1] + (box.x * sin + box.z * cos) * building.scale,
      halfX: box.halfX * building.scale,
      halfZ: box.halfZ * building.scale,
      rotationY: angle,
    }))
  })
}

export const VILLAGE_COLLIDERS = createVillageColliders()

function toLocal(x: number, z: number, collider: VillageCollider): { x: number; z: number } {
  const dx = x - collider.x
  const dz = z - collider.z
  const cos = Math.cos(collider.rotationY)
  const sin = Math.sin(collider.rotationY)
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos }
}

function toWorld(x: number, z: number, collider: VillageCollider): { x: number; z: number } {
  const cos = Math.cos(collider.rotationY)
  const sin = Math.sin(collider.rotationY)
  return { x: collider.x + x * cos - z * sin, z: collider.z + x * sin + z * cos }
}

export function isInsideVillageCollider(
  position: VillagePosition,
  radius = 0.35,
  collider: VillageCollider,
): boolean {
  const local = toLocal(position.x, position.z, collider)
  return Math.abs(local.x) < collider.halfX + radius && Math.abs(local.z) < collider.halfZ + radius
}

/** 원형 플레이어를 가장 가까운 외벽 바깥으로 밀어낸다. y는 바꾸지 않는다. */
export function resolveVillageCollision(position: VillagePosition, radius = 0.35): VillagePosition {
  let resolved = { ...position }
  for (const collider of VILLAGE_COLLIDERS) {
    const local = toLocal(resolved.x, resolved.z, collider)
    const limitX = collider.halfX + radius
    const limitZ = collider.halfZ + radius
    const penetrationX = limitX - Math.abs(local.x)
    const penetrationZ = limitZ - Math.abs(local.z)
    if (penetrationX <= 0 || penetrationZ <= 0) continue

    if (penetrationX < penetrationZ) local.x = Math.sign(local.x || 1) * (limitX + 1e-6)
    else local.z = Math.sign(local.z || 1) * (limitZ + 1e-6)
    const world = toWorld(local.x, local.z, collider)
    resolved = { x: world.x, y: resolved.y, z: world.z }
  }
  return resolved
}

/** 보수적 외접원으로 길 중심선과 collider 사이 1m 여유를 검사한다. */
export function conservativePathClearance(collider: VillageCollider): number {
  const centerDistance = distanceToCenterline(collider.x, collider.z, CENTERLINE)
  return centerDistance - Math.hypot(collider.halfX, collider.halfZ)
}
