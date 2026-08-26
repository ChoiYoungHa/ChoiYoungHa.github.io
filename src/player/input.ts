/**
 * 계획서.md §3-4 — 입력은 키가 아니라 **동작명**으로 추상화한다.
 * jump·interact 는 범위 밖(§1-2 제출 후 선택). Action 타입에 미리 넣지 않는다.
 */

export type Action =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'run'
  | 'lookX'
  | 'lookY'
  | 'toggleQuality'

export const DEFAULT_BINDINGS: Record<Exclude<Action, 'lookX' | 'lookY'>, string[]> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  toggleQuality: ['KeyQ'],
}

/** 컨트롤러가 매 프레임 받는 입력 상태. 키 코드가 아니라 의미만 담는다. */
export interface InputState {
  forward: number // -1..1  (W:+1, S:-1)
  strafe: number // -1..1  (D:+1, A:-1)
  run: boolean
  /** 카메라 yaw(라디안). 이동 방향을 카메라 기준으로 돌린다. */
  yaw: number
}

export const NEUTRAL_INPUT: InputState = { forward: 0, strafe: 0, run: false, yaw: 0 }

/** 키보드를 InputState 로 바꾸는 최소 구독기. M0-a 범위: 이동·달리기만. */
export function createKeyboardInput(target: EventTarget = window) {
  const pressed = new Set<string>()
  const onDown = (e: Event) => {
    pressed.add((e as KeyboardEvent).code)
  }
  const onUp = (e: Event) => {
    pressed.delete((e as KeyboardEvent).code)
  }
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)

  const held = (action: keyof typeof DEFAULT_BINDINGS) =>
    DEFAULT_BINDINGS[action].some((code) => pressed.has(code))

  return {
    read(yaw: number): InputState {
      return {
        forward: (held('moveForward') ? 1 : 0) - (held('moveBack') ? 1 : 0),
        strafe: (held('moveRight') ? 1 : 0) - (held('moveLeft') ? 1 : 0),
        run: held('run'),
        yaw,
      }
    },
    isDown: (action: keyof typeof DEFAULT_BINDINGS) => held(action),
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      pressed.clear()
    },
  }
}
