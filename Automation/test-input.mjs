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
    ['Digit2', 'skill'], ['KeyI', 'inventory'], ['Enter', 'confirm'],
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
  target.dispatchEvent(keyboardEvent('keydown', 'KeyW'))
  target.dispatchEvent(keyboardEvent('keydown', 'Space'))
  assert.equal(input.read(0).forward, 1)
  assert.deepEqual(input.consumePressed(), [])
  input.dispose()
})
