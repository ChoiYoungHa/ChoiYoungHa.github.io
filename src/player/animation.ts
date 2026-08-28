/**
 * M5-11 (R117-A) — 이동 속도 → Idle/Walk/Run 블렌드 가중치와 캐릭터 yaw 회전.
 *
 * three·React 비의존 순수 함수다(계획서 §5-6). 덕분에 브라우저 없이 Node 에서
 * 결정론적으로 검증한다 — `Automation/test-player-animation.mjs`.
 */

/**
 * 클립이 "발 미끄러짐 없이" 재생되는 기준 속도(m/s).
 * `controllers/types.ts` 의 `RAYCAST_DEFAULTS.walkSpeed`·`runSpeed` 와 같은 값이다.
 * 여기에 다시 적는 이유: 이 모듈은 컨트롤러에 의존하지 않아야 Node 테스트가 컨트롤러 변경에 흔들리지 않는다.
 */
export const WALK_CLIP_SPEED = 4.0
export const RUN_CLIP_SPEED = 6.5

/** 이 속도 이하는 정지로 본다. 감속 잔여 속도로 walk 가 깜빡이는 것을 막는다. */
export const IDLE_SPEED_EPSILON = 0.05

/** 크로스페이드 시간(s). 지수 평활의 3τ 로 쓴다 — 0.2s 에 약 95% 수렴한다. */
export const CROSSFADE_SECONDS = 0.2

/** 캐릭터 yaw 최대 회전 속도 = 720°/s. 카메라를 홱 돌려도 몸이 순간이동하듯 돌지 않는다. */
export const MAX_TURN_RATE_RADIANS = (720 * Math.PI) / 180

/** 클립 timeScale 범위. 극단 배속은 발 떨림을 만든다. */
export const MIN_CLIP_TIME_SCALE = 0.5
export const MAX_CLIP_TIME_SCALE = 1.6

export interface LocomotionWeights {
  idle: number
  walk: number
  run: number
}

export const IDLE_WEIGHTS: LocomotionWeights = { idle: 1, walk: 0, run: 0 }

function normalize(weights: LocomotionWeights): LocomotionWeights {
  const idle = Math.max(0, weights.idle)
  const walk = Math.max(0, weights.walk)
  const run = Math.max(0, weights.run)
  const sum = idle + walk + run
  if (!(sum > 0)) return { ...IDLE_WEIGHTS }
  return { idle: idle / sum, walk: walk / sum, run: run / sum }
}

/**
 * 속도만으로 정해지는 목표 가중치(즉시값). 합은 항상 1이다.
 *
 * 0 → idle · WALK_CLIP_SPEED → walk · RUN_CLIP_SPEED 이상 → run,
 * 그 사이는 인접한 두 클립의 선형 보간이다(idle↔walk, walk↔run).
 */
export function targetWeights(speed: number): LocomotionWeights {
  if (!Number.isFinite(speed) || speed <= IDLE_SPEED_EPSILON) return { ...IDLE_WEIGHTS }
  if (speed <= WALK_CLIP_SPEED) {
    const walk = speed / WALK_CLIP_SPEED
    return { idle: 1 - walk, walk, run: 0 }
  }
  if (speed >= RUN_CLIP_SPEED) return { idle: 0, walk: 0, run: 1 }
  const run = (speed - WALK_CLIP_SPEED) / (RUN_CLIP_SPEED - WALK_CLIP_SPEED)
  return { idle: 0, walk: 1 - run, run }
}

/**
 * 현재 가중치를 목표로 지수 평활한다(프레임레이트 독립). 합은 1로 정규화한다.
 * `fadeSeconds` 는 크로스페이드 총 시간으로, 그 시점에 약 95% 도달한다.
 */
export function blendWeights(
  current: LocomotionWeights,
  speed: number,
  dt: number,
  fadeSeconds = CROSSFADE_SECONDS,
): LocomotionWeights {
  const target = targetWeights(speed)
  if (!Number.isFinite(dt) || dt <= 0) return normalize(current)
  const tau = Math.max(1e-6, fadeSeconds / 3)
  const alpha = 1 - Math.exp(-dt / tau)
  return normalize({
    idle: current.idle + (target.idle - current.idle) * alpha,
    walk: current.walk + (target.walk - current.walk) * alpha,
    run: current.run + (target.run - current.run) * alpha,
  })
}

/**
 * 클립 재생 배속. 실제 속도가 클립 기준 속도와 다르면 그 비율만큼 배속해 발 접지를 맞춘다.
 * 정지(속도 ≤ ε)에서는 1을 돌려준다 — 가중치 0인 클립의 배속은 의미가 없다.
 */
export function clipTimeScale(speed: number, clipSpeed: number): number {
  if (!Number.isFinite(speed) || speed <= IDLE_SPEED_EPSILON || !(clipSpeed > 0)) return 1
  const ratio = speed / clipSpeed
  return Math.min(MAX_CLIP_TIME_SCALE, Math.max(MIN_CLIP_TIME_SCALE, ratio))
}

/** [-π, π) 로 감싼 각도. */
export function wrapAngle(radians: number): number {
  const twoPi = Math.PI * 2
  const wrapped = (radians + Math.PI) % twoPi
  return (wrapped < 0 ? wrapped + twoPi : wrapped) - Math.PI
}

/** 최단 방향으로 target 에 다가가되 초당 `maxRate` 라디안을 넘지 않는다. */
export function approachAngle(
  current: number,
  target: number,
  dt: number,
  maxRate = MAX_TURN_RATE_RADIANS,
): number {
  if (!Number.isFinite(current)) return wrapAngle(target)
  if (!Number.isFinite(target) || !Number.isFinite(dt) || dt <= 0) return wrapAngle(current)
  const delta = wrapAngle(target - current)
  const limit = maxRate * dt
  const step = Math.min(limit, Math.abs(delta)) * Math.sign(delta)
  return wrapAngle(current + step)
}
