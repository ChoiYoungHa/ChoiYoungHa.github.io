/**
 * M1-19 — 길 제외 마스크. 길 중심선 반경 2m 안에는 산포하지 않는다.
 *
 * 순수 함수만 둔다. main-path.json 을 여기서 import 하지 않는 이유는 두 가지다:
 *   1) 순수하면 브라우저 없이 `node --test` 로 그대로 검증된다(CLAUDE.md 코드 규칙).
 *   2) 데이터 로딩 방식(정적 import / fetch)을 씬 컴포넌트가 정하게 남겨둔다.
 * 2인자 형태 `isExcluded(x, z)` 가 필요하면 `createPathExclusion()` 으로 만든다.
 *
 * M1-20(전망 ray 제외)은 렌더가 필요해 여기 없다.
 */

export interface PathPoint {
  x: number
  z: number
}

/** 계획서 §1-2 "지형에 새긴 길 1개" — 폭 3m 길에 대한 산포 금지 반경. */
export const PATH_EXCLUSION_RADIUS = 2

/** 점 (x,z) 와 선분 (a,b) 사이 최단거리. */
export function distanceToSegment(x: number, z: number, a: PathPoint, b: PathPoint): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared === 0) return Math.hypot(x - a.x, z - a.z)
  // 선분 위 투영 위치를 0..1 로 자른다(선분 밖이면 끝점까지의 거리).
  let t = ((x - a.x) * dx + (z - a.z) * dz) / lengthSquared
  t = Math.min(1, Math.max(0, t))
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz))
}

/** 점 (x,z) 와 중심선(폴리라인) 사이 최단거리. */
export function distanceToCenterline(x: number, z: number, centerline: PathPoint[]): number {
  if (centerline.length === 0) return Number.POSITIVE_INFINITY
  if (centerline.length === 1) return Math.hypot(x - centerline[0].x, z - centerline[0].z)
  let best = Number.POSITIVE_INFINITY
  for (let i = 1; i < centerline.length; i++) {
    const d = distanceToSegment(x, z, centerline[i - 1], centerline[i])
    if (d < best) best = d
  }
  return best
}

/** 중심선 반경 안이면 true(= 산포 금지). */
export function isExcludedBy(
  x: number,
  z: number,
  centerline: PathPoint[],
  radius: number = PATH_EXCLUSION_RADIUS,
): boolean {
  return distanceToCenterline(x, z, centerline) < radius
}

/**
 * 중심선을 고정한 2인자 마스크를 만든다.
 * `const isExcluded = createPathExclusion(waypoints)` → `isExcluded(x, z)`
 * 그대로 `scatter({ reject: isExcluded })` 에 넘길 수 있다.
 */
export function createPathExclusion(
  centerline: PathPoint[],
  radius: number = PATH_EXCLUSION_RADIUS,
): (x: number, z: number) => boolean {
  return (x, z) => isExcludedBy(x, z, centerline, radius)
}

/**
 * M1-20 전망 제외 마스크.
 *
 * vista 에서 target 을 보는 시선 통로에는 산포하지 않는다. 통로는 vista 와 target 을
 * 잇는 선분 주변의 **쐐기(wedge)** 다 — vista 근처는 좁고 멀어질수록 넓어진다.
 * 좌·중·우 ray 3개(±spreadDeg)가 전부 비어 있어야 하므로 그 각도만큼을 반폭으로 잡는다.
 */
export interface VistaLine {
  position: PathPoint
  target: PathPoint
}

/** vista 바로 앞은 무조건 비운다(m). */
export const VISTA_NEAR_CLEAR = 6
/** 좌·중·우 ray 의 좌우 벌림(도). Docs/qa/m1-vista-rays.json 검사와 같은 값이어야 한다. */
export const VISTA_SPREAD_DEG = 6

/**
 * (x,z) 가 어떤 vista 의 시선 쐐기 안인가.
 * target 뒤쪽(투영 t>1)은 시야를 가리지 않으므로 제외하지 않는다.
 */
export function isExcludedByVistas(
  x: number,
  z: number,
  vistas: VistaLine[],
  spreadDeg: number = VISTA_SPREAD_DEG,
  nearClear: number = VISTA_NEAR_CLEAR,
): boolean {
  const tan = Math.tan((spreadDeg * Math.PI) / 180)
  for (const v of vistas) {
    const dx = v.target.x - v.position.x
    const dz = v.target.z - v.position.z
    const lenSq = dx * dx + dz * dz
    if (lenSq === 0) continue
    const px = x - v.position.x
    const pz = z - v.position.z
    const t = (px * dx + pz * dz) / lenSq
    if (t < 0 || t > 1) {
      // 시선 방향 밖 — 단 vista 발밑은 비운다
      if (Math.hypot(px, pz) < nearClear) return true
      continue
    }
    const along = t * Math.sqrt(lenSq)
    const perp = Math.abs(px * dz - pz * dx) / Math.sqrt(lenSq)
    if (perp < Math.max(nearClear, along * tan)) return true
  }
  return false
}

/** vista 목록을 고정한 2인자 마스크. `scatter({ reject })` 에 그대로 넘길 수 있다. */
export function createVistaExclusion(
  vistas: VistaLine[],
  spreadDeg: number = VISTA_SPREAD_DEG,
  nearClear: number = VISTA_NEAR_CLEAR,
): (x: number, z: number) => boolean {
  return (x, z) => isExcludedByVistas(x, z, vistas, spreadDeg, nearClear)
}

/** 중심선을 따라 등간격으로 샘플한다. 마스크 검증·길 메시 생성에 쓴다. */
export function sampleCenterline(centerline: PathPoint[], count: number): PathPoint[] {
  if (centerline.length < 2 || count < 1) return []
  const segments: number[] = []
  let total = 0
  for (let i = 1; i < centerline.length; i++) {
    const d = Math.hypot(
      centerline[i].x - centerline[i - 1].x,
      centerline[i].z - centerline[i - 1].z,
    )
    segments.push(d)
    total += d
  }

  const out: PathPoint[] = []
  for (let n = 0; n < count; n++) {
    const target = count === 1 ? 0 : (total * n) / (count - 1)
    let walked = 0
    let i = 0
    while (i < segments.length - 1 && walked + segments[i] < target) {
      walked += segments[i]
      i++
    }
    const t = segments[i] === 0 ? 0 : (target - walked) / segments[i]
    out.push({
      x: centerline[i].x + (centerline[i + 1].x - centerline[i].x) * t,
      z: centerline[i].z + (centerline[i + 1].z - centerline[i].z) * t,
    })
  }
  return out
}

/** 중심선 총 길이(m). */
export function centerlineLength(centerline: PathPoint[]): number {
  let total = 0
  for (let i = 1; i < centerline.length; i++) {
    total += Math.hypot(
      centerline[i].x - centerline[i - 1].x,
      centerline[i].z - centerline[i - 1].z,
    )
  }
  return total
}
