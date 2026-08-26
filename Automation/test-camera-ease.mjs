import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('camera distance eases from 6m to 9m over two seconds', async () => {
  const { easeDistance } = await load('src/game/world/cameraEase.ts')
  assert.equal(easeDistance(0), 6)
  assert.equal(easeDistance(1), 7.5)
  assert.equal(easeDistance(2), 9)
})

test('camera easing clamps elapsed time outside the transition', async () => {
  const { easeDistance } = await load('src/game/world/cameraEase.ts')
  assert.equal(easeDistance(-1), 6)
  assert.equal(easeDistance(3), 9)
})
