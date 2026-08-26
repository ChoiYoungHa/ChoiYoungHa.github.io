/**
 * R114-A (D6) — 팔로우 카메라 충돌. three·React 비의존 순수 함수.
 *
 * 플레이어(발치 XZ) → 원하는 카메라 위치(XZ) 선분을 마을 집(회전 박스)·거대 수목(원)에 캐스트해
 * 첫 교차점까지로 카메라 거리를 줄인다. 카메라는 지붕 내부로 들어가지 않고(D6),
 * 최소 거리 `CAMERA_MIN_DISTANCE` 아래로는 줄이지 않는다.
 * FollowCamera 는 `GAME_INPUT_ENABLED` 일 때만 이 함수를 호출한다 — 기본 경로·bench·final 은 불변.
 */

export interface CameraPlanarPoint {
  x: number
  z: number
}

/** `src/scene/colliders/village.ts` VillageCollider 와 같은 형태(회전 박스). */
export interface CameraBox {
  x: number
  z: number
  halfX: number
  halfZ: number
  rotationY: number
}

export interface CameraCircle {
  x: number
  z: number
  radius: number
}

export interface CameraCollisionOptions {
  /** 이보다 짧게는 줄이지 않는다(m). */
  minDistance: number
  /** 벽에서 이만큼 띄운다(m) — near plane·벽 두께 여유. */
  margin: number
}

export interface CameraCollisionResult {
  /** 허용 거리(m, 평면). 막힘이 없으면 요청 거리 그대로. */
  distance: number
  /** distance / 요청 거리 (0..1). 요청 거리 0 이면 1. */
  fraction: number
  blocked: boolean
}

export const CAMERA_MIN_DISTANCE = 1.5
export const CAMERA_COLLISION_MARGIN = 0.35
const EPSILON = 1e-9

const DEFAULT_OPTIONS: CameraCollisionOptions = {
  minDistance: CAMERA_MIN_DISTANCE,
  margin: CAMERA_COLLISION_MARGIN,
}

/** 선분 p→q 가 회전 박스(여유 margin 포함)에 처음 닿는 매개변수 t(0..1). 안 닿으면 null. p 가 안에 있으면 0. */
export function segmentBoxEntry(p: CameraPlanarPoint, q: CameraPlanarPoint, box: CameraBox, margin = 0): number | null {
  const cos = Math.cos(box.rotationY)
  const sin = Math.sin(box.rotationY)
  const toLocal = (x: number, z: number) => {
    const dx = x - box.x
    const dz = z - box.z
    return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos }
  }
  const a = toLocal(p.x, p.z)
  const b = toLocal(q.x, q.z)
  const hx = box.halfX + margin
  const hz = box.halfZ + margin
  const dx = b.x - a.x
  const dz = b.z - a.z
  let tMin = 0
  let tMax = 1
  for (const [origin, delta, half] of [[a.x, dx, hx], [a.z, dz, hz]] as const) {
    if (Math.abs(delta) < EPSILON) {
      if (Math.abs(origin) > half) return null
      continue
    }
    let t1 = (-half - origin) / delta
    let t2 = (half - origin) / delta
    if (t1 > t2) [t1, t2] = [t2, t1]
    tMin = Math.max(tMin, t1)
    tMax = Math.min(tMax, t2)
    if (tMin > tMax) return null
  }
  return tMin
}

/** 선분 p→q 가 원(여유 margin 포함)에 처음 닿는 t(0..1). 안 닿으면 null. p 가 안에 있으면 0. */
export function segmentCircleEntry(p: CameraPlanarPoint, q: CameraPlanarPoint, circle: CameraCircle, margin = 0): number | null {
  const r = circle.radius + margin
  const fx = p.x - circle.x
  const fz = p.z - circle.z
  const dx = q.x - p.x
  const dz = q.z - p.z
  const a = dx * dx + dz * dz
  const b = 2 * (fx * dx + fz * dz)
  const c = fx * fx + fz * fz - r * r
  if (c <= 0) return 0
  if (a < EPSILON) return null
  const disc = b * b - 4 * a * c
  if (disc < 0) return null
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t >= 0 && t <= 1 ? t : null
}

/**
 * 플레이어→카메라 선분을 콜라이더에 캐스트해 허용 거리를 돌려준다.
 * 결과 거리는 [minDistance, 요청 거리] 로 클램프된다(요청 거리가 minDistance 보다 짧으면 그대로).
 */
export function clampCameraDistance(
  player: CameraPlanarPoint,
  desired: CameraPlanarPoint,
  boxes: readonly CameraBox[],
  circles: readonly CameraCircle[] = [],
  options: Partial<CameraCollisionOptions> = {},
): CameraCollisionResult {
  const { minDistance, margin } = { ...DEFAULT_OPTIONS, ...options }
  const requested = Math.hypot(desired.x - player.x, desired.z - player.z)
  if (requested < EPSILON) return { distance: requested, fraction: 1, blocked: false }
  let tHit = 1
  for (const box of boxes) {
    const t = segmentBoxEntry(player, desired, box, margin)
    if (t !== null && t < tHit) tHit = t
  }
  for (const circle of circles) {
    const t = segmentCircleEntry(player, desired, circle, margin)
    if (t !== null && t < tHit) tHit = t
  }
  if (tHit >= 1) return { distance: requested, fraction: 1, blocked: false }
  const distance = Math.min(requested, Math.max(minDistance, tHit * requested))
  return { distance, fraction: distance / requested, blocked: true }
}
