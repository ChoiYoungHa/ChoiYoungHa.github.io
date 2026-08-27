import { forwardFromYaw, type InputState } from '../input.ts'
// 확장자를 명시한다(tsconfig.app.json `allowImportingTsExtensions: true`).
// 이래야 `node --test`가 이 파일을 빌드 없이 그대로 실행할 수 있다(M0b-11 완료 조건).
// 타입 전용 import 는 Node 가 지워버리므로 확장자가 필요 없다.
import {
  RAYCAST_DEFAULTS,
  type GroundSampler,
  type KinematicController,
  type RaycastParams,
  type StepResult,
  type Vec3,
} from './types.ts'

/**
 * 계획서.md §3-4 구현 A — 레이캐스트/하이트샘플 접지 컨트롤러 (M0).
 *
 * 의존성 0. three 도 React 도 쓰지 않는다.
 * M0-a 범위: 걷기 · 달리기 · 지면 접지. **점프·상호작용 없음**(§1-2).
 */
/**
 * M2-10 — 수평 충돌 해소 훅. `(x,z)` 를 받아 밀어낸 `(x,z)` 를 돌려준다.
 * 컨트롤러는 무엇과 부딪히는지 모른다 — 거대 수목·집 어느 쪽이든 이 형태면 된다.
 */
export type CollisionResolver = (pos: { x: number; z: number }) => { x: number; z: number }

export function createRaycastController(
  sampleGround: GroundSampler,
  start: Vec3 = { x: 0, y: 0, z: 0 },
  params: Partial<RaycastParams> = {},
  resolveCollision?: CollisionResolver,
): KinematicController {
  const p: RaycastParams = { ...RAYCAST_DEFAULTS, ...params }

  const position: Vec3 = { ...start }
  let velX = 0
  let velY = 0
  let velZ = 0
  let heading = 0

  // 시작 위치를 지면에 붙인다
  const g0 = sampleGround(position.x, position.z)
  if (g0 !== null) position.y = g0 + p.eyeOffset
  let jumpGrounded = g0 !== null

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
      const forward = forwardFromYaw(input.yaw)
      // forward = -Z (three 관례), strafe = +X
      wishX = nf * forward.x - ns * forward.z
      wishZ = nf * forward.z + ns * forward.x
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
      const withinSlope = slopeDeg <= p.maxSlopeDeg
        || (p.jumpEnabled && slopeDeg <= p.maxSlopeDeg + 1e-9)
      if (withinSlope) {
        position.x = nextX
        position.z = nextZ
        // M2-10 — 지형을 통과한 뒤 수평 충돌을 푼다.
        // 이동을 취소하지 않고 밀어내므로 줄기를 따라 미끄러진다(벽에 붙어 멈추지 않는다).
        if (resolveCollision) {
          const pushed = resolveCollision({ x: position.x, z: position.z })
          if (pushed.x !== position.x || pushed.z !== position.z) {
            position.x = pushed.x
            position.z = pushed.z
            // 밀려난 방향의 속도 성분을 죽인다. 안 죽이면 다음 프레임에 같은 힘으로 다시 파고든다.
            velX = 0
            velZ = 0
          }
        }
      } else {
        velX = 0
        velZ = 0
      }
      const groundY = sampleGround(position.x, position.z)
      if (!p.jumpEnabled && groundY !== null) {
        const desiredY = groundY + p.eyeOffset
        const dy = desiredY - position.y
        // 접지 스냅: 한 스텝에 groundSnap 이상 수직 보정하지 않는다(절벽 순간이동 방지).
        position.y += Math.abs(dy) <= p.groundSnap ? dy : Math.sign(dy) * p.groundSnap
        grounded = true
      }
    }

    if (p.jumpEnabled) {
      const groundY = sampleGround(position.x, position.z)
      const desiredY = groundY === null ? null : groundY + p.eyeOffset
      if (jumpGrounded && input.jump) {
        jumpGrounded = false
        velY = p.jumpSpeed
      }
      if (!jumpGrounded) {
        velY += p.gravity * dt
        position.y += velY * dt
        if (desiredY !== null && velY <= 0 && position.y <= desiredY) {
          position.y = desiredY
          velY = 0
          jumpGrounded = true
        }
      } else if (desiredY !== null) {
        const dy = desiredY - position.y
        position.y += Math.abs(dy) <= p.groundSnap ? dy : Math.sign(dy) * p.groundSnap
      }
      grounded = jumpGrounded
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
