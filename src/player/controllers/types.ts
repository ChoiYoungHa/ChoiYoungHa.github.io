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
}

export const RAYCAST_DEFAULTS: RaycastParams = {
  walkSpeed: 3.2,
  runSpeed: 5.6,
  acceleration: 12,
  turnLerp: 0.15,
  maxSlopeDeg: 40,
  groundSnap: 0.35,
  eyeOffset: 0.9,
}
