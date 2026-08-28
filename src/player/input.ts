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
  | 'stats'
  | 'quick3'
  | 'quick4'
  | 'quick5'
  | 'quick6'
  | 'cancel'
  | 'confirm'

// 2026-08-28 영하님: 이동은 WASD(방향키 병행), 스탯창은 C(S 는 후진과 충돌), 아이템은 I.
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
  stats: ['KeyC'],
  quick3: ['Digit3'],
  quick4: ['Digit4'],
  quick5: ['Digit5'],
  quick6: ['Digit6'],
  cancel: ['Escape'],
  confirm: ['Enter'],
}

export const GAMEPLAY_ACTIONS = ['jump', 'interact', 'attack', 'skill', 'inventory', 'stats', 'quick3', 'quick4', 'quick5', 'quick6', 'confirm', 'cancel'] as const
export const QUICK_SLOT_KEYS = [3, 4, 5, 6] as const
export type QuickSlotKey = (typeof QUICK_SLOT_KEYS)[number]
export type GameplayAction = typeof GAMEPLAY_ACTIONS[number]

export function isGameInputEnabled(search = '', viteGame = ''): boolean {
  return new URLSearchParams(search).get('game') === '1' || viteGame === '1'
}

export const GAME_INPUT_ENABLED = isGameInputEnabled(
  typeof location === 'undefined' ? '' : location.search,
  import.meta.env?.VITE_GAME,
)

export interface Forward2 {
  x: number
  z: number
}

/** Controller-authoritative Three.js convention: yaw 0 faces -Z, positive yaw turns toward -X. */
export function forwardFromYaw(yaw: number): Forward2 {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

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

/**
 * 텍스트 입력 요소에 포커스가 있으면 게임 키를 무시한다.
 * 2026-08-28: HUD 버튼을 클릭하면 포커스가 버튼에 남아 숫자키·I·S 가 전부 삼켜졌다("공격이 안 나갈 때가 있다").
 * 버튼은 Space/Enter(버튼 활성화 키)만 양보하고 나머지 키는 받는다.
 */
function acceptsGameKey(target: EventTarget | null, code: string): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return true
  if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return false
  if (target.tagName === 'BUTTON') return code !== 'Space' && code !== 'Enter'
  return true
}

const MOVEMENT_CODES = new Set([
  ...DEFAULT_BINDINGS.moveForward, ...DEFAULT_BINDINGS.moveBack,
  ...DEFAULT_BINDINGS.moveLeft, ...DEFAULT_BINDINGS.moveRight,
])

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
    const accepted = acceptsGameKey(e.target, keyboard.code)
    // 방향키가 페이지 스크롤·버튼 포커스 이동으로 새지 않게 한다(텍스트 입력 중은 제외).
    if (accepted && MOVEMENT_CODES.has(keyboard.code)) keyboard.preventDefault()
    if (!gameInputEnabled || !firstPress || keyboard.repeat || !accepted) return
    for (const action of GAMEPLAY_ACTIONS) {
      if (DEFAULT_BINDINGS[action].includes(keyboard.code)) pressedEdges.add(action)
    }
  }
  const onUp = (e: Event) => {
    pressed.delete((e as KeyboardEvent).code)
  }
  // 창 포커스를 잃으면(알트탭 등) keyup 이 오지 않는다. 눌림 상태를 비워 이동·자동공격이 멈추지 않는 일을 막는다.
  const onBlur = () => pressed.clear()
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)
  target.addEventListener('blur', onBlur)

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
    // 홀드 판정도 edge 와 같은 포커스 가드를 따른다(설정 패널 select·슬라이더에 포커스가 있으면 자동공격도 멈춘다).
    isDown: (action: keyof typeof DEFAULT_BINDINGS) => DEFAULT_BINDINGS[action].some((code) =>
      pressed.has(code) && (typeof document === 'undefined' || acceptsGameKey(document.activeElement, code))),
    consumePressed(): GameplayAction[] {
      const edges = [...pressedEdges]
      pressedEdges.clear()
      return edges
    },
    dispose() {
      target.removeEventListener('keydown', onDown)
      target.removeEventListener('keyup', onUp)
      target.removeEventListener('blur', onBlur)
      pressed.clear()
      pressedEdges.clear()
    },
  }
}
