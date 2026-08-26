import type { InputState } from '../player/input'
import type { Vec3 } from '../player/controllers/types'

/**
 * bench 러너 ↔ 실제 Player 사이의 얇은 다리.
 *
 * 왜 zustand 가 아닌가: 여기 오가는 값은 **매 프레임** 바뀐다.
 * 계획서.md §3-3 이 "매 프레임 바뀌는 값은 스토어에 넣지 않는다"고 정했으므로
 * 리액티브 스토어가 아니라 모듈 지역 변수로 둔다. 구독자도 리렌더도 없다.
 *
 * 방향 두 개:
 *   1) 입력 주입  — 러너가 setInputSource() 로 프레임별 InputState 를 공급한다.
 *      Player 는 소스가 있으면 키보드 대신 그걸 읽는다. 카메라 yaw 도 여기서 온다.
 *   2) 상태 발행  — Player 가 매 프레임 자기 결과를 publishPlayerFrame() 로 올린다.
 *      러너는 종료 시 이걸 읽어 finalPosition 을 만든다.
 *
 * 이 구조 덕분에 bench 는 **화면에 실제로 그려지는 Player** 를 구동한다.
 * (R12-B 까지는 러너가 별도 controller 를 돌려서 fps 와 동선이 무관했다.)
 */

export interface PlayerFrame {
  position: Vec3
  heading: number
  speed: number
  grounded: boolean
}

/** Player 가 실제로 적분한 시간(초). 벽시계 60초와 이 값이 벌어지면 동선이 짧아진다. */
let integratedSeconds = 0
let ungroundedFrames = 0
let minY = Number.POSITIVE_INFINITY

export type InputSource = () => InputState

let inputSource: InputSource | null = null
let latestFrame: PlayerFrame | null = null
let frameCount = 0

/** 러너가 입력을 가로챈다. null 을 주면 다시 사람 입력으로 돌아간다. */
export function setInputSource(source: InputSource | null): void {
  inputSource = source
}

export function readInputSource(): InputSource | null {
  return inputSource
}

/** Player 가 매 프레임 호출한다. */
export function publishPlayerFrame(frame: PlayerFrame, dt = 0): void {
  latestFrame = frame
  frameCount += 1
  integratedSeconds += dt
  if (!frame.grounded) ungroundedFrames += 1
  if (frame.position.y < minY) minY = frame.position.y
}

/** 접지 실패 프레임 수와 최저 y. 낙하·관통 판정의 근거다(로드맵 M1-07). */
export function readGroundingStats(): { ungroundedFrames: number; minY: number } {
  return { ungroundedFrames, minY }
}

/** 적분된 시간 합. 러너가 벽시계 경과와 대조한다. */
export function readIntegratedSeconds(): number {
  return integratedSeconds
}

export function readPlayerFrame(): PlayerFrame | null {
  return latestFrame
}

/** Player 가 실제로 그린 프레임 수. 러너의 rAF 틱 수가 아니다. */
export function readPlayerFrameCount(): number {
  return frameCount
}
