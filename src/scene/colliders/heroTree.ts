
/**
 * M2-10 — 거대 수목 줄기 충돌 proxy.
 *
 * 지오메트리로 충돌을 풀지 않는다. 줄기는 위로 갈수록 가늘어지지만 플레이어는
 * 눈높이 0.9m 로만 걷기 때문에, **밑동 반경 하나짜리 수직 원기둥**이면 충분하다.
 * 계획서 §3-4 가 M0 컨트롤러를 "의존성 0" 으로 잡았으므로 여기도 three·rapier 를 쓰지 않는다.
 *
 * 순수 함수라 브라우저 없이 Node 에서 관통 0 을 검증한다(`Automation/test-colliders.mjs`).
 */

export interface Circle {
  x: number
  z: number
  radius: number
}

export interface Vec2 {
  x: number
  z: number
}

/**
 * 줄기 충돌 반경(m).
 * 밑동 지름 5.2m → 반경 2.6m 에 플레이어 캡슐 반폭 0.4m 를 더한다.
 * 캐릭터 큐브가 0.8m 폭이므로(Controller.tsx) 반폭 0.4m 다.
 */
export const PLAYER_RADIUS = 0.4
/**
 * R100-A(master 결정) — GLB 수목(BigTree_3Donimus, 줄기 ≈3~4m + 안쪽 뿌리) 발자국 반경(m). 뿌리 바깥(≤17m)은 통과 허용.
 * 절차 수목의 밑동 지름 5.2m(반경 2.6m)는 heroTreeGeometry 에 그대로 두고, 충돌만 이 값을 쓴다. 충돌 반경 = 7.6 + 플레이어 0.4 = 8.0.
 */
export const HERO_FOOTPRINT_RADIUS = 7.6
export const HERO_TRUNK_RADIUS = HERO_FOOTPRINT_RADIUS + PLAYER_RADIUS

/** 밀어낼 때 표면에 딱 붙지 않게 두는 여유(m). 0 이면 매 프레임 경계에서 떨린다. */
const SKIN = 0.02

/**
 * 원기둥 밖으로 밀어낸다. 안에 없으면 좌표를 그대로 돌려준다.
 *
 * 중심에 정확히 서 있는 경우(거리 0)는 밀 방향이 없다 — 그때는 +X 로 민다.
 * 실제로 일어나지 않지만, 일어나면 NaN 이 되므로 명시적으로 처리한다.
 */
export function resolveAgainstCircle(pos: Vec2, circle: Circle): Vec2 {
  const dx = pos.x - circle.x
  const dz = pos.z - circle.z
  const d = Math.hypot(dx, dz)
  if (d >= circle.radius) return pos
  const target = circle.radius + SKIN
  if (d === 0) return { x: circle.x + target, z: circle.z }
  const k = target / d
  return { x: circle.x + dx * k, z: circle.z + dz * k }
}

/** 여러 콜라이더를 차례로 적용한다. 개수가 한 자릿수라 공간 분할은 과잉이다. */
export function resolveCollision(pos: Vec2, colliders: Circle[]): Vec2 {
  let out = pos
  for (const c of colliders) out = resolveAgainstCircle(out, c)
  return out
}

/** heroTree 위치로부터 콜라이더 하나를 만든다. */
export function heroTreeCollider(position: Vec2): Circle {
  return { x: position.x, z: position.z, radius: HERO_TRUNK_RADIUS }
}
