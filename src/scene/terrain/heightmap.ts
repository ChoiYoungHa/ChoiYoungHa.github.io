import mainPath from '../../data/main-path.json' with { type: 'json' }
import { WORLD_HALF_EXTENT } from '../bounds.ts'
import { hashSeed } from '../scatter/seededRandom.ts'

/**
 * M1-02·03 대체 — 절차적 지형 높이 함수 (master 결정: Blender 미설치).
 *
 * 요구(로드맵 M1-02·03 + 이번 지시):
 *   - 250m 범위, 완만: 최대 기복 ≤ 12m, 경사 ≤ 25°
 *   - 길 중심선 반경 6m 평탄
 *   - 마을 예정지 평지
 *   - 동굴·내부 공간 0
 *
 * 마지막 항목은 구조적으로 보장된다: 이 지형은 (x,z) → y 인 **높이 함수**다.
 * 한 좌표에 높이가 하나뿐이라 오버행·동굴이 존재할 수 없다.
 *
 * three·React 에 의존하지 않는다 → 브라우저 없이 `node --test` 로 검증한다(CLAUDE.md).
 */

export interface HeightPoint {
  x: number
  z: number
}

/** 최대 기복(m). 높이는 ±MAX_RELIEF/2 안에 든다. */
export const MAX_RELIEF = 12

/** 지형 노이즈 seed. 바꾸면 지형이 바뀌므로 성능 비교 전제가 깨진다. */
export const TERRAIN_SEED = hashSeed('m1-terrain-v1')

/** 길 중심선에서 이 반경 안은 평탄하다. */
export const PATH_FLAT_RADIUS = 6
/** 평탄 구간에서 자연 지형으로 돌아가는 전이 끝 반경. */
export const PATH_BLEND_RADIUS = 24

/** 마을 예정지 평지 반경과 전이 끝 반경. */
export const VILLAGE_FLAT_RADIUS = 22
export const VILLAGE_BLEND_RADIUS = 45

/**
 * 옥타브. 파장이 진폭보다 훨씬 길어야 경사가 완만하다.
 * amp 는 상대값이고 아래에서 합으로 정규화한 뒤 MAX_RELIEF/2 를 곱한다.
 */
const OCTAVES = [
  { wavelength: 160, amp: 1.0 },
  { wavelength: 80, amp: 0.5 },
  { wavelength: 40, amp: 0.25 },
  { wavelength: 20, amp: 0.12 },
] as const

const AMP_SUM = OCTAVES.reduce((sum, o) => sum + o.amp, 0)

const CENTERLINE: HeightPoint[] = mainPath.waypoints.map((w) => ({ x: w.x, z: w.z }))
const VILLAGE: HeightPoint = mainPath.landmarks.villageCenter

/** 격자점 해시 → [-1, 1). 테이블을 쓰지 않아 좌표만으로 재현된다. */
function latticeNoise(ix: number, iz: number, seed: number): number {
  let h = seed ^ Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  h ^= h >>> 15
  return ((h >>> 0) / 2147483648) - 1
}

/** 5차 smoothstep — 1·2계 도함수가 격자 경계에서 0이라 각진 이음매가 안 생긴다. */
function smootherstep(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** 격자 보간 value noise. 결과 [-1, 1). */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = smootherstep(x - x0)
  const fz = smootherstep(z - z0)
  const n00 = latticeNoise(x0, z0, seed)
  const n10 = latticeNoise(x0 + 1, z0, seed)
  const n01 = latticeNoise(x0, z0 + 1, seed)
  const n11 = latticeNoise(x0 + 1, z0 + 1, seed)
  const a = n00 + (n10 - n00) * fx
  const b = n01 + (n11 - n01) * fx
  return a + (b - a) * fz
}

/** 옥타브 합 → [-1, 1] 정규화. */
function fbm(x: number, z: number, seed: number): number {
  let sum = 0
  for (let i = 0; i < OCTAVES.length; i++) {
    const o = OCTAVES[i]
    sum += valueNoise(x / o.wavelength, z / o.wavelength, seed + i * 7919) * o.amp
  }
  return sum / AMP_SUM
}

/** 0(바깥) → 1(안쪽). inner 이하는 1, outer 이상은 0. */
function falloff(distance: number, inner: number, outer: number): number {
  if (distance <= inner) return 1
  if (distance >= outer) return 0
  return 1 - smootherstep((distance - inner) / (outer - inner))
}

/** 폴리라인 위 가장 가까운 점과 그 거리. */
export function nearestOnCenterline(
  x: number,
  z: number,
  centerline: HeightPoint[] = CENTERLINE,
): { point: HeightPoint; distance: number } {
  let best = { point: centerline[0], distance: Number.POSITIVE_INFINITY }
  for (let i = 1; i < centerline.length; i++) {
    const a = centerline[i - 1]
    const b = centerline[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    let t = lenSq === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / lenSq
    t = Math.min(1, Math.max(0, t))
    const px = a.x + t * dx
    const pz = a.z + t * dz
    const d = Math.hypot(x - px, z - pz)
    if (d < best.distance) best = { point: { x: px, z: pz }, distance: d }
  }
  return best
}

/** 노이즈 + 마을 평지. 길 평탄화의 기준 높이로도 쓴다. */
function baseHeight(x: number, z: number): number {
  const raw = fbm(x, z, TERRAIN_SEED) * (MAX_RELIEF / 2)
  const dVillage = Math.hypot(x - VILLAGE.x, z - VILLAGE.z)
  const w = falloff(dVillage, VILLAGE_FLAT_RADIUS, VILLAGE_BLEND_RADIUS)
  if (w === 0) return raw
  return raw + (villageLevel() - raw) * w
}

/** 가중치 특이점 방지(m²). 가장 가까운 세그먼트가 여전히 압도적으로 크다. */
/** 마을 기준 높이는 상수다 — 샘플마다 fbm 을 다시 돌리지 않는다(값 동일). */
let villageLevelCache: number | null = null
function villageLevel(): number {
  if (villageLevelCache === null) villageLevelCache = fbm(VILLAGE.x, VILLAGE.z, TERRAIN_SEED) * (MAX_RELIEF / 2)
  return villageLevelCache
}

/** 경로 중심선까지의 최단 거리만 계산한다(pathLevelAt 의 distance 와 동일한 수식). */
function pathDistanceAt(x: number, z: number): number {
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 1; i < CENTERLINE.length; i++) {
    const a = CENTERLINE[i - 1]
    const b = CENTERLINE[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    let t = lenSq === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / lenSq
    t = Math.min(1, Math.max(0, t))
    const px = a.x + t * dx
    const pz = a.z + t * dz
    const d = Math.hypot(x - px, z - pz)
    if (d < nearest) nearest = d
  }
  return nearest
}

const LEVEL_EPSILON = 0.25

/**
 * 길 평탄화의 기준 높이와 중심선까지의 거리.
 *
 * ★ 가장 가까운 세그먼트 하나만 쓰면 안 된다. 두 세그먼트가 등거리인 지점
 * (곡선 안쪽의 medial axis)에서 최근접점이 **불연속으로 튀어** 높이가 계단이 된다.
 * 실측: 0.022m 전진에 최근접점이 6.5m 도약 → 그 지점 경사 82°.
 * 컨트롤러는 경사 40°를 넘으면 이동을 취소하므로 플레이어가 눈에 안 보이는 벽에 막혔다
 * (bench leg3 에서 속도가 3.2 → 1.4 m/s 로 떨어졌다).
 *
 * 그래서 모든 세그먼트의 투영 높이를 **거리 역제곱 가중평균**한다. 어디서도 연속이다.
 */
function pathLevelAt(x: number, z: number): { level: number; distance: number } {
  let weightSum = 0
  let levelSum = 0
  let nearest = Number.POSITIVE_INFINITY
  for (let i = 1; i < CENTERLINE.length; i++) {
    const a = CENTERLINE[i - 1]
    const b = CENTERLINE[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    let t = lenSq === 0 ? 0 : ((x - a.x) * dx + (z - a.z) * dz) / lenSq
    t = Math.min(1, Math.max(0, t))
    const px = a.x + t * dx
    const pz = a.z + t * dz
    const d = Math.hypot(x - px, z - pz)
    if (d < nearest) nearest = d
    const w = 1 / (d * d + LEVEL_EPSILON)
    weightSum += w
    levelSum += w * baseHeight(px, pz)
  }
  return { level: levelSum / weightSum, distance: nearest }
}

/**
 * 지형 높이(m).
 *
 * 길은 상수 높이로 깎지 않고 **중심선 높이**로 맞춘다.
 * 그래야 길이 가로로 평평하면서 세로로는 지형을 따라간다 —
 * 상수로 깎으면 길 양옆에 절벽이 생겨 경사 한계를 깬다.
 */
export function sampleHeight(x: number, z: number): number {
  const h = baseHeight(x, z)
  // 경로 밖(w=0)에서는 level 이 결과에 쓰이지 않는다 — 세그먼트마다 fbm 을 도는 pathLevelAt 을 건너뛴다.
  // 진입 정지 10초의 주범(2026-08-27 프로파일: 노이즈 5.7s + pathLevelAt 1.1s). 결과값은 이전과 비트 동일.
  if (pathDistanceAt(x, z) >= PATH_BLEND_RADIUS) return h
  const { level, distance } = pathLevelAt(x, z)
  const w = falloff(distance, PATH_FLAT_RADIUS, PATH_BLEND_RADIUS)
  if (w === 0) return h
  return h + (level - h) * w
}

/**
 * 컨트롤러의 `GroundSampler` 계약(계획서 §3-4). 경계 밖은 null.
 * `Prototype.sampleGround` 의 자리를 M1-04 에서 이 함수가 넘겨받는다.
 */
export function sampleGround(x: number, z: number): number | null {
  if (Math.abs(x) > WORLD_HALF_EXTENT || Math.abs(z) > WORLD_HALF_EXTENT) return null
  return sampleHeight(x, z)
}
