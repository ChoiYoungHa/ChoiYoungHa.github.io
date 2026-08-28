import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

function keyboardEvent(type, code, repeat = false) {
  const event = new Event(type)
  Object.defineProperties(event, {
    code: { value: code },
    repeat: { value: repeat },
  })
  return event
}

test('M6 gameplay bindings emit one edge per physical key press', async () => {
  const { createKeyboardInput } = await load('src/player/input.ts')
  const target = new EventTarget()
  const input = createKeyboardInput(target, { gameInputEnabled: true })

  for (const [code, action] of [
    ['Space', 'jump'], ['KeyF', 'interact'], ['Digit1', 'attack'],
    ['Digit2', 'skill'], ['KeyI', 'inventory'], ['KeyC', 'stats'], ['Enter', 'confirm'],
  ]) {
    target.dispatchEvent(keyboardEvent('keydown', code))
    target.dispatchEvent(keyboardEvent('keydown', code, true))
    assert.deepEqual(input.consumePressed(), [action])
    assert.deepEqual(input.consumePressed(), [])
    target.dispatchEvent(keyboardEvent('keyup', code))
  }
  input.dispose()
})

test('gameplay edges are disabled by default without changing movement holds', async () => {
  const { createKeyboardInput } = await load('src/player/input.ts')
  const target = new EventTarget()
  const input = createKeyboardInput(target)
  target.dispatchEvent(keyboardEvent('keydown', 'ArrowUp'))
  target.dispatchEvent(keyboardEvent('keydown', 'Space'))
  assert.equal(input.read(0).forward, 1)
  assert.deepEqual(input.consumePressed(), [])
  input.dispose()
})

test('2026-08-28 버튼에 포커스가 있어도 게임 키는 받고 Space/Enter 만 버튼에 양보한다', async () => {
  const { createKeyboardInput } = await load('src/player/input.ts')
  class FakeElement extends EventTarget {}
  const previous = globalThis.HTMLElement
  globalThis.HTMLElement = FakeElement
  try {
    class FakeButton extends FakeElement { tagName = 'BUTTON'; isContentEditable = false }
    const button = new FakeButton()
    const input = createKeyboardInput(button, { gameInputEnabled: true })
    for (const [code, action] of [['Digit1', 'attack'], ['KeyI', 'inventory'], ['KeyC', 'stats'], ['Escape', 'cancel']]) {
      button.dispatchEvent(keyboardEvent('keydown', code))
      assert.deepEqual(input.consumePressed(), [action], `${code} 는 버튼 포커스 중에도 동작한다`)
      button.dispatchEvent(keyboardEvent('keyup', code))
    }
    button.dispatchEvent(keyboardEvent('keydown', 'Space'))
    button.dispatchEvent(keyboardEvent('keydown', 'Enter'))
    assert.deepEqual(input.consumePressed(), [], 'Space/Enter 는 버튼 활성화 키라 게임 edge 로 쓰지 않는다')
    input.dispose()

    class FakeInput extends FakeElement { tagName = 'INPUT'; isContentEditable = false }
    const text = new FakeInput()
    const typing = createKeyboardInput(text, { gameInputEnabled: true })
    text.dispatchEvent(keyboardEvent('keydown', 'Digit1'))
    assert.deepEqual(typing.consumePressed(), [], '텍스트 입력 중엔 게임 키를 무시한다')
    typing.dispose()
  } finally {
    globalThis.HTMLElement = previous
  }
})

test('2026-08-28 이동은 WASD 와 방향키 둘 다, C 는 스탯 edge 다', async () => {
  const { createKeyboardInput, DEFAULT_BINDINGS } = await load('src/player/input.ts')
  assert.deepEqual([DEFAULT_BINDINGS.moveForward, DEFAULT_BINDINGS.moveBack, DEFAULT_BINDINGS.moveLeft, DEFAULT_BINDINGS.moveRight], [['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']])
  assert.deepEqual(DEFAULT_BINDINGS.stats, ['KeyC'])
  const target = new EventTarget()
  const input = createKeyboardInput(target, { gameInputEnabled: true })
  target.dispatchEvent(keyboardEvent('keydown', 'KeyW'))
  target.dispatchEvent(keyboardEvent('keydown', 'KeyD'))
  target.dispatchEvent(keyboardEvent('keydown', 'KeyC'))
  assert.deepEqual(input.read(0), { forward: 1, strafe: 1, run: false, yaw: 0 })
  assert.deepEqual(input.consumePressed(), ['stats'])
  target.dispatchEvent(keyboardEvent('keyup', 'KeyW'))
  target.dispatchEvent(keyboardEvent('keyup', 'KeyD'))
  target.dispatchEvent(keyboardEvent('keydown', 'ArrowUp'))
  target.dispatchEvent(keyboardEvent('keydown', 'ArrowRight'))
  assert.deepEqual(input.read(0), { forward: 1, strafe: 1, run: false, yaw: 0 })
  assert.equal(input.isDown('attack'), false)
  target.dispatchEvent(keyboardEvent('keydown', 'Digit1'))
  assert.equal(input.isDown('attack'), true)
  input.dispose()
})

test('2026-08-28 창 blur 로 keyup 이 유실돼도 눌림 상태가 남지 않는다(홀드 자동공격·이동 고착 방지)', async () => {
  const { createKeyboardInput } = await load('src/player/input.ts')
  const target = new EventTarget()
  const input = createKeyboardInput(target, { gameInputEnabled: true })
  target.dispatchEvent(keyboardEvent('keydown', 'Digit1'))
  target.dispatchEvent(keyboardEvent('keydown', 'ArrowUp'))
  assert.equal(input.isDown('attack'), true)
  assert.equal(input.read(0).forward, 1)
  target.dispatchEvent(new Event('blur'))
  assert.equal(input.isDown('attack'), false)
  assert.equal(input.read(0).forward, 0)
  target.dispatchEvent(keyboardEvent('keydown', 'Digit1'))
  assert.deepEqual(input.consumePressed().filter((a) => a === 'attack'), ['attack'], 'blur 뒤 다시 누르면 새 edge 로 인식한다')
  input.dispose()
})
