import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('공원 스폰 8점은 반경 40m 안이고 서로 6m 이상 떨어진다', async () => {
  const data = await readJson('src/game/data/spawns.json')
  assert.deepEqual(data.parkCenter, { x: -80, z: 8 })
  assert.equal(data.parkRadiusMeters, 40)
  assert.equal(data.points.length, 8)

  for (const point of data.points) {
    assert.ok(Math.hypot(point.x + 80, point.z - 8) <= 40)
  }
  for (let left = 0; left < data.points.length; left += 1) {
    for (let right = left + 1; right < data.points.length; right += 1) {
      const a = data.points[left]
      const b = data.points[right]
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 6)
    }
  }
})

test('돼지는 wander→chase→attack→dying→dead 순서와 공격 수치를 지킨다', async () => {
  const { createMob, damageMob, stepMob } = await load('src/game/mobs/ai.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const rng = mulberry32(82)
  let mob = createMob('pig-01', { x: 0, z: 0 }, rng)
  const transitions = []

  let result = stepMob(mob, {
    dtSeconds: 1 / 60,
    nowSeconds: 0,
    playerPosition: { x: 5, z: 0 },
  }, rng)
  mob = result.mob
  transitions.push(...result.events.filter((event) => event.type === 'state-change').map((event) => event.to))
  assert.equal(mob.state, 'chase')

  result = stepMob(mob, {
    dtSeconds: 1 / 60,
    nowSeconds: 1 / 60,
    playerPosition: { x: 0.5, z: 0 },
  }, rng)
  mob = result.mob
  transitions.push(...result.events.filter((event) => event.type === 'state-change').map((event) => event.to))
  assert.equal(mob.state, 'attack')

  result = stepMob(mob, {
    dtSeconds: 1 / 60,
    nowSeconds: 2 / 60,
    playerPosition: { x: 0.5, z: 0 },
  }, rng)
  assert.deepEqual(result.events, [{ type: 'attack', mobId: 'pig-01', damage: 8 }])
  mob = result.mob

  result = damageMob(mob, 65, 0.1)
  mob = result.mob
  transitions.push(...result.events.filter((event) => event.type === 'state-change').map((event) => event.to))
  assert.equal(mob.state, 'dying')
  assert.equal(stepMob(mob, {
    dtSeconds: 0.59,
    nowSeconds: 0.69,
    playerPosition: { x: 100, z: 100 },
  }, rng).mob.state, 'dying')

  result = stepMob(mob, {
    dtSeconds: 0.02,
    nowSeconds: 0.71,
    playerPosition: { x: 100, z: 100 },
  }, rng)
  transitions.push(...result.events.filter((event) => event.type === 'state-change').map((event) => event.to))
  assert.equal(result.mob.state, 'dead')
  assert.deepEqual(transitions, ['chase', 'attack', 'dying', 'dead'])
})

test('플레이어가 멀리 정지한 60초 동안 동시 10 이하·배회 반경 5m를 지킨다', async () => {
  const { createSpawner, stepSpawner } = await load('src/game/mobs/spawner.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const rng = mulberry32(0x6030)
  let state = createSpawner(rng)
  let maxConcurrent = 0
  let concurrentSum = 0

  for (let frame = 0; frame < 60 * 60; frame += 1) {
    const nowSeconds = frame / 60
    const result = stepSpawner(state, {
      dtSeconds: 1 / 60,
      nowSeconds,
      playerPosition: { x: 1000, z: 1000 },
    }, rng)
    state = result.state
    const live = state.slots.flatMap((slot) => slot.mob === null ? [] : [slot.mob])
    maxConcurrent = Math.max(maxConcurrent, live.length)
    concurrentSum += live.length
    for (const mob of live) {
      assert.ok(Math.hypot(
        mob.position.x - mob.spawnPosition.x,
        mob.position.z - mob.spawnPosition.z,
      ) <= 5 + 1e-9)
    }
  }

  assert.ok(maxConcurrent <= 10)
  assert.equal(state.totalSpawned, 8)
  assert.equal(state.totalDeaths, 0)
  assert.equal(concurrentSum / (60 * 60), 8)
})

test('죽은 슬롯은 소멸 8±0.1초 뒤 같은 개체 id로 재사용된다', async () => {
  const { createSpawner, damageSpawnerMob, stepSpawner } = await load('src/game/mobs/spawner.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const rng = mulberry32(0x8badf00d)
  let state = createSpawner(rng)
  const mobId = state.slots[0].mob.id
  state = damageSpawnerMob(state, mobId, 999, 0)
  let despawnAt = null
  let respawnAt = null

  for (let frame = 1; frame <= 60 * 10; frame += 1) {
    const nowSeconds = frame / 60
    const result = stepSpawner(state, {
      dtSeconds: 1 / 60,
      nowSeconds,
      playerPosition: { x: 1000, z: 1000 },
    }, rng)
    state = result.state
    for (const event of result.events) {
      if (event.type === 'despawn' && event.mobId === mobId) despawnAt = nowSeconds
      if (event.type === 'respawn' && event.mobId === mobId) respawnAt = nowSeconds
    }
  }

  assert.equal(state.totalDeaths, 1)
  assert.equal(state.totalSpawned, 9)
  assert.ok(Math.abs((respawnAt - despawnAt) - 8) <= 0.1)
  assert.equal(state.slots[0].mob.id, mobId)
})

test('60초 동안 15초 간격 처치 4회를 수용하고 평균 동시 수를 기록한다', async () => {
  const { createSpawner, damageSpawnerMob, stepSpawner } = await load('src/game/mobs/spawner.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const rng = mulberry32(0x603060)
  let state = createSpawner(rng)
  let concurrentSum = 0
  let scriptedKills = 0

  for (let frame = 0; frame < 60 * 60; frame += 1) {
    const nowSeconds = frame / 60
    if (frame % (15 * 60) === 0) {
      const mob = state.slots[0].mob
      if (mob !== null) {
        state = damageSpawnerMob(state, mob.id, 999, nowSeconds)
        scriptedKills += 1
      }
    }
    state = stepSpawner(state, {
      dtSeconds: 1 / 60,
      nowSeconds,
      playerPosition: { x: 1000, z: 1000 },
    }, rng).state
    concurrentSum += state.slots.filter((slot) => slot.mob !== null).length
  }

  const averageConcurrent = concurrentSum / (60 * 60)
  assert.equal(scriptedKills, 4)
  assert.equal(state.totalDeaths, 4)
  assert.equal(state.totalSpawned, 12)
  assert.ok(Math.abs(averageConcurrent - 7.4667) < 0.001)
  console.log(JSON.stringify({ scriptedKills, totalSpawned: state.totalSpawned, averageConcurrent }))
})
