import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('walking pig lower legs wobble on z with the fixed amplitude and frequency', async () => {
  const {
    MOB_WOBBLE_AMPLITUDE,
    MOB_WOBBLE_FREQUENCY,
    mobWobbleOffset,
  } = await load('src/shaders/mobWobble.ts')

  assert.equal(MOB_WOBBLE_AMPLITUDE, 0.06)
  assert.equal(MOB_WOBBLE_FREQUENCY, 8)
  assert.equal(mobWobbleOffset(0.1, Math.PI / 16, 1, 0), 0.06)
  assert.equal(mobWobbleOffset(0.29, Math.PI / 16, 1, 0), 0.06)
  assert.equal(Math.abs(mobWobbleOffset(0.1, 123.45, 1, 7)) <= MOB_WOBBLE_AMPLITUDE, true)
})

test('stationary pigs and vertices outside the lower-leg mask do not wobble', async () => {
  const { mobWobbleOffset } = await load('src/shaders/mobWobble.ts')
  assert.equal(mobWobbleOffset(0.1, 1, 0, 0), 0)
  assert.equal(mobWobbleOffset(0.3, 1, 1, 0), 0)
  assert.equal(mobWobbleOffset(1, 1, 1, 0), 0)
})
