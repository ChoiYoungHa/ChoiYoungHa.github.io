/**
 * M1-01 — 250m 수직 슬라이스의 월드 경계.
 *
 * 계획서.md §1-2: "250m × 250m 지형 1장". X/Z 를 -125~125m 로 고정한다.
 *
 * ★ 지금 런타임이 쓰는 바닥은 아직 `Prototype.tsx` 의 GROUND_HALF = 40m 다.
 *   여기 상수는 **M1-04(지형 런타임 임포트)** 에서 그 자리를 넘겨받는다.
 *   이 파일은 값만 정의하고 기존 프로토타입 바닥을 건드리지 않는다.
 */

/** 원점에서 경계까지(m). 전체 폭·깊이는 이 값의 2배다. */
export const WORLD_HALF_EXTENT = 125

/** 월드 한 변의 길이(m). */
export const WORLD_SIZE = WORLD_HALF_EXTENT * 2

export const WORLD_BOUNDS = {
  minX: -WORLD_HALF_EXTENT,
  maxX: WORLD_HALF_EXTENT,
  minZ: -WORLD_HALF_EXTENT,
  maxZ: WORLD_HALF_EXTENT,
} as const

/**
 * 플레이어 이탈 방지 여유(m).
 * 경계에 정확히 붙으면 카메라(뒤로 6m, 계획서 §3-4)가 지형 밖을 비춘다.
 * 그래서 플레이어는 경계보다 안쪽에서 멈춘다.
 */
export const PLAYER_EDGE_MARGIN = 3

/** 플레이어가 실제로 갈 수 있는 최대 반경(m). */
export const PLAYER_HALF_EXTENT = WORLD_HALF_EXTENT - PLAYER_EDGE_MARGIN

/** (x, z) 가 지형 안인가. */
export function isInsideWorld(x: number, z: number): boolean {
  return Math.abs(x) <= WORLD_HALF_EXTENT && Math.abs(z) <= WORLD_HALF_EXTENT
}

/** (x, z) 가 플레이어 이동 가능 범위 안인가. */
export function isInsidePlayerBounds(x: number, z: number): boolean {
  return Math.abs(x) <= PLAYER_HALF_EXTENT && Math.abs(z) <= PLAYER_HALF_EXTENT
}

/** 이탈 방지 — 플레이어 좌표를 이동 가능 범위로 되돌린다. */
export function clampToPlayerBounds(x: number, z: number): { x: number; z: number } {
  return {
    x: Math.min(PLAYER_HALF_EXTENT, Math.max(-PLAYER_HALF_EXTENT, x)),
    z: Math.min(PLAYER_HALF_EXTENT, Math.max(-PLAYER_HALF_EXTENT, z)),
  }
}
