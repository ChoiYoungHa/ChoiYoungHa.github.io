import type { InputState } from '../input'

/**
 * 계획서.md §3-4 — 인터페이스 1개, 구현 2개.
 *   A. raycast (M0)   — 지면 높이 샘플링. 의존성 0
 *   B. rapier  (M1+)  — KinematicCharacterController
 * 인터페이스를 먼저 고정해 두면 교체 비용이 파일 1개다.
 *
 * three 타입에 의존하지 않는다 — 게임 규칙을 렌더러와 분리한다(계획서.md §5-6).
 * 덕분에 브라우저 없이 Node 에서 결정론적으로 검증할 수 있다.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface StepResult {
  position: Vec3
  grounded: boolean
  speed: number
  /** 캐릭터가 바라보는 방향(라디안). 이동 중에만 갱신된다. */
  heading: number
}

export interface KinematicController {
  step(input: InputState, dt: number): StepResult
  readonly position: Vec3
  /** 워프: 즉시 (x,z) 로 옮기고 지면에 앉힌다. */
  teleport(x: number, z: number): void
}

/** (x,z) 의 지면 높이. 지면이 없으면 null. */
export type GroundSampler = (x: number, z: number) => number | null

/** 계획서.md §3-4 구현 A 파라미터 */
export interface RaycastParams {
  walkSpeed: number
  runSpeed: number
  acceleration: number
  turnLerp: number
  maxSlopeDeg: number
  groundSnap: number
  /** 캡슐 중심에서 발끝까지. 접지 시 position.y = groundY + eyeOffset */
  eyeOffset: number
  /** M6 opt-in. false면 기존 접지 계산을 그대로 사용한다. */
  jumpEnabled: boolean
  jumpSpeed: number
  gravity: number
}

// 2026-08-28 영하님 "걷는 속도 조금 더 빠르게": 걷기 3.2→4.0 · 달리기 5.6→6.5 m/s.
export const RAYCAST_DEFAULTS: RaycastParams = {
  walkSpeed: 4.0,
  runSpeed: 6.5,
  acceleration: 12,
  turnLerp: 0.15,
  maxSlopeDeg: 40,
  groundSnap: 0.35,
  eyeOffset: 0.9,
  jumpEnabled: false,
  jumpSpeed: 5.2,
  gravity: -18,
}

/** 실측 속도로 "달리기" 를 판정하는 문턱(튜토리얼 힌트·세션 run 입력). 걷기와 달리기의 중간값이라 걷기만으로는 넘지 않는다. */
export const RUN_INPUT_SPEED_THRESHOLD = (RAYCAST_DEFAULTS.walkSpeed + RAYCAST_DEFAULTS.runSpeed) / 2

/**
 * `?route=bench|final` 재생 전용 속도. bench/final-route.json 의 waypoint 시각·yaw 는 이 속도(3.2/5.6)로 피팅돼 routeHash 로 고정돼 있다.
 * 걷기 속도를 올려도(2026-08-28) 측정 정본 동선이 깨지지 않도록 러너 모드에서만 이 값을 쓴다.
 */
export const ROUTE_CONTROLLER_SPEEDS: Pick<RaycastParams, 'walkSpeed' | 'runSpeed'> = { walkSpeed: 3.2, runSpeed: 5.6 }
