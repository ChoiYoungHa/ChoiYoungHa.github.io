export const PROP_KINDS = ['fence', 'stonewall', 'arch', 'banner'] as const

export type PropKind = (typeof PROP_KINDS)[number]

export interface PropPlacement {
  kind: PropKind
  position: [number, number]
  /** Y-axis rotation in radians. */
  yaw: number
  scale: number
}

export interface LayoutPoint {
  x: number
  z: number
}

export interface LayoutHouseCollider extends LayoutPoint {
  buildingId: string
  halfX: number
  halfZ: number
  rotationY: number
}

export interface PropsLayoutAudit {
  valid: boolean
  counts: Record<PropKind, number>
  pathIntrusions: number[]
  archMisalignments: number[]
  boundaryViolations: number[]
  houseOverlaps: { propIndex: number; buildingId: string }[]
  invalidEntries: number[]
  countMismatches: { kind: PropKind; expected: number; actual: number }[]
}

/** M5-09 approved village set: 1 gate, 2 side walls, 10 yard fences, 3 wall banners. */
export const REQUIRED_PROP_COUNTS: Record<PropKind, number> = {
  fence: 10,
  stonewall: 2,
  arch: 1,
  banner: 3,
}

/** main-path width 3m / 2 + 2.5m feather. */
export const PATH_EXCLUSION_METERS = 4

/** Conservative XZ bounding radii of the normalized KayKit meshes at scale=1. */
const BASE_FOOTPRINT_RADIUS: Record<PropKind, number> = {
  fence: 0.58,
  stonewall: 0.59,
  arch: 1.1,
  banner: 0.133,
}

/**
 * R103-A — 소품 실제 높이 정규화. placement.scale 대신 종별 목표 높이(m) / GLB 정규화 높이(단위, 원점 바닥) 로 런타임 스케일을 정한다.
 * 이전 placement scale(fence 2.2·stonewall 3·arch 3·banner 4)은 자산 실측 없이 잡은 값이라 울타리가 집보다 컸다(R100 S2).
 */
// 스윕(R103-A, auditPropsLayout): stonewall 1.0(스케일 3.7)은 길 제외대 침범(idx 1,2), banner 2.2(7.86)는 village-01 collider 겹침 → 0.8/1.8 이 겹침 0 인 최대값.
export const PROP_TARGET_HEIGHTS: Record<PropKind, number> = { fence: 1.1, stonewall: 0.8, arch: 4.5, banner: 1.8 }
/** normalizedGeometry(Props.tsx) 후 bbox 높이(GLB 단위) — public/models/prop_*.glb accessor min/max 실측(R103-A). */
export const PROP_BASE_HEIGHTS: Record<PropKind, number> = { fence: 0.55, stonewall: 0.27, arch: 1.41, banner: 0.28 }

export function propRuntimeScale(kind: PropKind): number {
  return PROP_TARGET_HEIGHTS[kind] / PROP_BASE_HEIGHTS[kind]
}

/** 발자국 반경은 런타임 스케일 기준(placement.scale 은 더 이상 렌더에 쓰지 않는다). */
export function propFootprintRadius(prop: PropPlacement): number {
  return BASE_FOOTPRINT_RADIUS[prop.kind] * propRuntimeScale(prop.kind)
}

export function distanceToPolyline(point: LayoutPoint, centerline: readonly LayoutPoint[]): number {
  if (centerline.length === 0) return Number.POSITIVE_INFINITY
  if (centerline.length === 1) return Math.hypot(point.x - centerline[0].x, point.z - centerline[0].z)

  let nearest = Number.POSITIVE_INFINITY
  for (let index = 1; index < centerline.length; index += 1) {
    const a = centerline[index - 1]
    const b = centerline[index]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSquared = dx * dx + dz * dz
    const rawT = lengthSquared === 0 ? 0 : ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared
    const t = Math.max(0, Math.min(1, rawT))
    nearest = Math.min(nearest, Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t)))
  }
  return nearest
}

function nearestSegmentDirection(point: LayoutPoint, centerline: readonly LayoutPoint[]): LayoutPoint | null {
  let nearestDistance = Number.POSITIVE_INFINITY
  let nearestDirection: LayoutPoint | null = null
  for (let index = 1; index < centerline.length; index += 1) {
    const a = centerline[index - 1]
    const b = centerline[index]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const length = Math.hypot(dx, dz)
    if (length === 0) continue
    const rawT = ((point.x - a.x) * dx + (point.z - a.z) * dz) / (length * length)
    const t = Math.max(0, Math.min(1, rawT))
    const distance = Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t))
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestDirection = { x: dx / length, z: dz / length }
    }
  }
  return nearestDirection
}

function overlapsHouse(point: LayoutPoint, radius: number, house: LayoutHouseCollider): boolean {
  const dx = point.x - house.x
  const dz = point.z - house.z
  const cos = Math.cos(house.rotationY)
  const sin = Math.sin(house.rotationY)
  const localX = dx * cos + dz * sin
  const localZ = -dx * sin + dz * cos
  const outsideX = Math.max(Math.abs(localX) - house.halfX, 0)
  const outsideZ = Math.max(Math.abs(localZ) - house.halfZ, 0)
  return Math.hypot(outsideX, outsideZ) < radius
}

function isPropKind(value: unknown): value is PropKind {
  return typeof value === 'string' && (PROP_KINDS as readonly string[]).includes(value)
}

/** Pure M5-09 placement audit; the gate alone may occupy the main-path exclusion band. */
export function auditPropsLayout(
  props: readonly PropPlacement[],
  centerline: readonly LayoutPoint[],
  houses: readonly LayoutHouseCollider[],
  worldHalfExtent = 125,
): PropsLayoutAudit {
  const counts: Record<PropKind, number> = { fence: 0, stonewall: 0, arch: 0, banner: 0 }
  const pathIntrusions: number[] = []
  const archMisalignments: number[] = []
  const boundaryViolations: number[] = []
  const houseOverlaps: { propIndex: number; buildingId: string }[] = []
  const invalidEntries: number[] = []

  props.forEach((prop, propIndex) => {
    if (
      !isPropKind(prop.kind) ||
      !Array.isArray(prop.position) ||
      prop.position.length !== 2 ||
      !prop.position.every(Number.isFinite) ||
      !Number.isFinite(prop.yaw) ||
      !Number.isFinite(prop.scale) ||
      prop.scale <= 0
    ) {
      invalidEntries.push(propIndex)
      return
    }

    counts[prop.kind] += 1
    const [x, z] = prop.position
    const radius = propFootprintRadius(prop)
    if (Math.abs(x) + radius > worldHalfExtent || Math.abs(z) + radius > worldHalfExtent) {
      boundaryViolations.push(propIndex)
    }
    if (prop.kind !== 'arch' && distanceToPolyline({ x, z }, centerline) < PATH_EXCLUSION_METERS + radius) {
      pathIntrusions.push(propIndex)
    }
    if (prop.kind === 'arch') {
      const pathDirection = nearestSegmentDirection({ x, z }, centerline)
      // Three.js local +X after rotateY(yaw) is (cos(yaw), -sin(yaw)); it must be normal to the path.
      const alignment = pathDirection
        ? Math.abs(Math.cos(prop.yaw) * pathDirection.x - Math.sin(prop.yaw) * pathDirection.z)
        : 1
      if (alignment > 0.05) archMisalignments.push(propIndex)
    }
    for (const house of houses) {
      if (overlapsHouse({ x, z }, radius, house)) houseOverlaps.push({ propIndex, buildingId: house.buildingId })
    }
  })

  const countMismatches = PROP_KINDS.flatMap((kind) =>
    counts[kind] === REQUIRED_PROP_COUNTS[kind]
      ? []
      : [{ kind, expected: REQUIRED_PROP_COUNTS[kind], actual: counts[kind] }],
  )
  const valid =
    invalidEntries.length === 0 &&
    pathIntrusions.length === 0 &&
    archMisalignments.length === 0 &&
    boundaryViolations.length === 0 &&
    houseOverlaps.length === 0 &&
    countMismatches.length === 0

  return { valid, counts, pathIntrusions, archMisalignments, boundaryViolations, houseOverlaps, invalidEntries, countMismatches }
}
