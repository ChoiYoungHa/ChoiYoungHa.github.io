/**
 * 계획서.md §3-4 — 입력은 키가 아니라 **동작명**으로 추상화한다.
 * M6 확장 동작은 GAME_INPUT_ENABLED 일 때만 edge 이벤트를 낸다. 이동 계약은 항상 유지한다.
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
  | 'jump'
  | 'interact'
  | 'attack'
  | 'skill'
  | 'inventory'
  | 'confirm'

export const DEFAULT_BINDINGS: Record<Exclude<Action, 'lookX' | 'lookY'>, string[]> = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBack: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  toggleQuality: ['KeyQ'],
  jump: ['Space'],
  interact: ['KeyF'],
  attack: ['Digit1'],
  skill: ['Digit2'],
  inventory: ['KeyI'],
  confirm: ['Enter'],
}

export const GAMEPLAY_ACTIONS = ['jump', 'interact', 'attack', 'skill', 'inventory', 'confirm'] as const
export type GameplayAction = typeof GAMEPLAY_ACTIONS[number]

export function isGameInputEnabled(search = '', viteGame = ''): boolean {
  return new URLSearchParams(search).get('game') === '1' || viteGame === '1'
}

export const GAME_INPUT_ENABLED = isGameInputEnabled(
  typeof location === 'undefined' ? '' : location.search,
  import.meta.env?.VITE_GAME,
)

/** 컨트롤러가 매 프레임 받는 입력 상태. 키 코드가 아니라 의미만 담는다. */
export interface InputState {
  forward: number // -1..1  (W:+1, S:-1)
  strafe: number // -1..1  (D:+1, A:-1)
  run: boolean
  /** 게이트된 1프레임 takeoff edge. 기본 이동 경로에서는 undefined다. */
  jump?: boolean
  /** 카메라 yaw(라디안). 이동 방향을 카메라 기준으로 돌린다. */
  yaw: number
}

export const NEUTRAL_INPUT: InputState = { forward: 0, strafe: 0, run: false, yaw: 0 }

export interface KeyboardInputOptions {
  gameInputEnabled?: boolean
}

function acceptsGameKey(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return true
  return !target.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)
}

/** 키보드를 InputState 와 게이트된 M6 edge 동작으로 바꾸는 최소 구독기. */
export function createKeyboardInput(
  target: EventTarget = window,
  options: KeyboardInputOptions = {},
) {
  const pressed = new Set<string>()
  const pressedEdges = new Set<GameplayAction>()
  const gameInputEnabled = options.gameInputEnabled ?? GAME_INPUT_ENABLED
  const onDown = (e: Event) => {
    const keyboard = e as KeyboardEvent
    const firstPress = !pressed.has(keyboard.code)
    pressed.add(keyboard.code)
    if (!gameInputEnabled || !firstPress || keyboard.repeat || !acceptsGameKey(e.target)) return
    for (const action of GAMEPLAY_ACTIONS) {
      if (DEFAULT_BINDINGS[action].includes(keyboard.code)) pressedEdges.add(action)
    }
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
    consumePressed(): GameplayAction[] {
      const edges = [...pressedEdges]
      pressedEdges.clear()
      return edges
    },
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      pressed.clear()
      pressedEdges.clear()
    },
  }
}
