import type { InputState } from '../input'
import {
  RAYCAST_DEFAULTS,
  type GroundSampler,
  type KinematicController,
  type RaycastParams,
  type StepResult,
  type Vec3,
} from './types'

/**
 * 계획서.md §3-4 구현 A — 레이캐스트/하이트샘플 접지 컨트롤러 (M0).
 *
 * 의존성 0. three 도 React 도 쓰지 않는다.
 * M0-a 범위: 걷기 · 달리기 · 지면 접지. **점프·상호작용 없음**(§1-2).
 */
export function createRaycastController(
  sampleGround: GroundSampler,
  start: Vec3 = { x: 0, y: 0, z: 0 },
  params: Partial<RaycastParams> = {},
): KinematicController {
  const p: RaycastParams = { ...RAYCAST_DEFAULTS, ...params }

  const position: Vec3 = { ...start }
  let velX = 0
  let velZ = 0
  let heading = 0

  // 시작 위치를 지면에 붙인다
  const g0 = sampleGround(position.x, position.z)
  if (g0 !== null) position.y = g0 + p.eyeOffset

  function step(input: InputState, dt: number): StepResult {
    // 1) 입력을 카메라 yaw 기준 월드 방향으로
    const f = input.forward
    const s = input.strafe
    const len = Math.hypot(f, s)
    let wishX = 0
    let wishZ = 0
    if (len > 0) {
      const nf = f / len
      const ns = s / len
      const sin = Math.sin(input.yaw)
      const cos = Math.cos(input.yaw)
      // forward = -Z (three 관례), strafe = +X
      wishX = ns * cos - nf * sin
      wishZ = -nf * cos - ns * sin
    }

    // 2) 목표 속도로 가속/감속 (프레임레이트 독립)
    const target = input.run ? p.runSpeed : p.walkSpeed
    const tgtX = wishX * target
    const tgtZ = wishZ * target
    const maxDelta = p.acceleration * dt
    velX = approach(velX, tgtX, maxDelta)
    velZ = approach(velZ, tgtZ, maxDelta)

    // 3) 수평 이동
    const nextX = position.x + velX * dt
    const nextZ = position.z + velZ * dt

    // 4) 접지 — 지면 높이 샘플. 경사 한계를 넘으면 이동을 취소한다.
    const here = sampleGround(position.x, position.z)
    const there = sampleGround(nextX, nextZ)
    let grounded = false

    if (there === null) {
      // 지면 밖 — 이동 취소 (M0-a 는 낙하 없음)
      velX = 0
      velZ = 0
    } else {
      const horiz = Math.hypot(nextX - position.x, nextZ - position.z)
      const rise = here === null ? 0 : there - here
      const slopeDeg = horiz > 1e-6 ? (Math.atan2(Math.abs(rise), horiz) * 180) / Math.PI : 0
      if (slopeDeg <= p.maxSlopeDeg) {
        position.x = nextX
        position.z = nextZ
      } else {
        velX = 0
        velZ = 0
      }
      const groundY = sampleGround(position.x, position.z)
      if (groundY !== null) {
        const desiredY = groundY + p.eyeOffset
        const dy = desiredY - position.y
        // 접지 스냅: 한 스텝에 groundSnap 이상 수직 보정하지 않는다(절벽 순간이동 방지).
        position.y += Math.abs(dy) <= p.groundSnap ? dy : Math.sign(dy) * p.groundSnap
        grounded = true
      }
    }

    // 5) 이동 중일 때만 바라보는 방향 보간
    const speed = Math.hypot(velX, velZ)
    if (speed > 0.05) {
      const want = Math.atan2(velX, -velZ)
      heading = lerpAngle(heading, want, p.turnLerp)
    }

    return { position: { ...position }, grounded, speed, heading }
  }

  return {
    step,
    get position() {
      return position
    },
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const d = target - current
  if (Math.abs(d) <= maxDelta) return target
  return current + Math.sign(d) * maxDelta
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (diff < -Math.PI) diff += Math.PI * 2
  return a + diff * t
}
