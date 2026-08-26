import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('플로터 풀은 활성 16개를 넘으면 가장 오래된 슬롯을 교체한다', async () => {
  const poolRules = await load('src/game/util/pool.ts')
  let pool = poolRules.createFloaterPool()
  const handles = []

  for (let index = 0; index < 16; index += 1) {
    const result = poolRules.acquire(pool, `floater-${index}`, index)
    pool = result.pool
    handles.push(result.handle)
    assert.equal(result.replaced, null)
  }
  assert.equal(poolRules.activeCount(pool), 16)

  const replacement = poolRules.acquire(pool, 'floater-16', 16)
  pool = replacement.pool
  assert.equal(replacement.replaced, 'floater-0')
  assert.equal(poolRules.activeCount(pool), 16)
  assert.equal(poolRules.activeValues(pool).includes('floater-0'), false)
  assert.equal(poolRules.activeValues(pool).includes('floater-16'), true)

  const staleRelease = poolRules.release(pool, handles[0])
  assert.equal(staleRelease.released, false)
  assert.equal(staleRelease.pool, pool)
})

test('release한 슬롯은 다음 acquire에서 재사용되고 handle 세대가 바뀐다', async () => {
  const poolRules = await load('src/game/util/pool.ts')
  let pool = poolRules.createPool(2)
  const first = poolRules.acquire(pool, 'a', 1)
  pool = first.pool
  const second = poolRules.acquire(pool, 'b', 2)
  pool = second.pool

  const released = poolRules.release(pool, first.handle)
  assert.equal(released.released, true)
  pool = released.pool
  assert.equal(poolRules.activeCount(pool), 1)

  const reused = poolRules.acquire(pool, 'c', 3)
  assert.equal(reused.handle.index, first.handle.index)
  assert.notEqual(reused.handle.generation, first.handle.generation)
  assert.deepEqual(poolRules.activeValues(reused.pool).sort(), ['b', 'c'])
})

test('드롭 풀은 활성 24개 상한을 유지한다', async () => {
  const poolRules = await load('src/game/util/pool.ts')
  let pool = poolRules.createDropPool()
  for (let index = 0; index < 30; index += 1) {
    pool = poolRules.acquire(pool, index, index).pool
  }
  assert.equal(pool.capacity, 24)
  assert.equal(poolRules.activeCount(pool), 24)
  assert.deepEqual(poolRules.activeValues(pool), Array.from({ length: 24 }, (_, index) => index + 6))
})
