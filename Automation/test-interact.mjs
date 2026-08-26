import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('시야 안 NPC 여러 명 중 가장 가까운 id를 반환한다', async () => {
  const { findInteractable } = await load('src/game/world/interact.ts')
  const result = findInteractable(
    { x: 0, z: 0 },
    0,
    [
      { id: 'stan', position: { x: 0, z: -2 } },
      { id: 'maya', position: { x: 0, z: -1 } },
    ],
    { range: 2.5, fovDeg: 90 },
  )
  assert.equal(result, 'maya')
})

test('거리 2.5m 경계는 포함하고 2.5001m는 제외한다', async () => {
  const { findInteractable } = await load('src/game/world/interact.ts')
  const options = { range: 2.5, fovDeg: 90 }
  assert.equal(findInteractable(
    { x: 0, z: 0 }, 0,
    [{ id: 'boundary', position: { x: 0, z: -2.5 } }], options,
  ), 'boundary')
  assert.equal(findInteractable(
    { x: 0, z: 0 }, 0,
    [{ id: 'outside', position: { x: 0, z: -2.5001 } }], options,
  ), null)
})

test('시야각 90°의 절반각 45° 경계는 포함하고 바깥은 제외한다', async () => {
  const { findInteractable } = await load('src/game/world/interact.ts')
  const radius = 2
  const boundary = Math.PI / 4
  const outside = boundary + 0.001
  const options = { range: 2.5, fovDeg: 90 }

  assert.equal(findInteractable(
    { x: 0, z: 0 }, 0,
    [{ id: 'boundary', position: {
      x: Math.sin(boundary) * radius,
      z: -Math.cos(boundary) * radius,
    } }], options,
  ), 'boundary')
  assert.equal(findInteractable(
    { x: 0, z: 0 }, 0,
    [{ id: 'outside', position: {
      x: Math.sin(outside) * radius,
      z: -Math.cos(outside) * radius,
    } }], options,
  ), null)
})

test('뒤쪽 NPC만 있으면 기본 2.5m·90° 옵션에서도 null이다', async () => {
  const { findInteractable } = await load('src/game/world/interact.ts')
  assert.equal(findInteractable(
    { x: 0, z: 0 },
    0,
    [{ id: 'behind', position: { x: 0, z: -1 } }],
  ), 'behind')
  assert.equal(findInteractable(
    { x: 0, z: 0 },
    0,
    [{ id: 'behind', position: { x: 0, z: 1 } }],
  ), null)
})
