import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('부활점은 길 waypoint 중 raw 마을 AABB와 처음 만나는 P0 (0,24)다', async () => {
  const { RESPAWN_POSITION } = await load('src/game/rules/respawn.ts')
  const path = await readJson('src/data/main-path.json')
  const zones = await readJson('src/game/data/zones.json')
  const village = zones.zones.village
  const firstInside = path.waypoints.find((point) => (
    point.x >= village.min.x && point.x <= village.max.x
    && point.z >= village.min.z && point.z <= village.max.z
  ))

  assert.deepEqual(firstInside, path.waypoints[0])
  assert.deepEqual(RESPAWN_POSITION, { x: 0, z: 24 })
})

test('HP 0은 1.5초 dying 뒤 HP 50%·MP/메소 유지로 부활하고 어그로 해제를 낸다', async () => {
  const { beginDeath, stepRespawn } = await load('src/game/rules/respawn.ts')
  const initial = {
    phase: 'alive',
    hp: 0,
    maxHp: 160,
    mp: 37,
    meso: 785,
    position: { x: -80, z: 8 },
    dyingUntilSeconds: null,
  }
  const started = beginDeath(initial, 10)
  assert.equal(started.state.phase, 'dying')
  assert.equal(started.state.dyingUntilSeconds, 11.5)
  assert.deepEqual(started.events, [{ type: 'death-start' }])

  const waiting = stepRespawn(started.state, 11.499)
  assert.equal(waiting.state, started.state)
  assert.deepEqual(waiting.events, [])

  const respawned = stepRespawn(started.state, 11.5)
  assert.deepEqual(respawned.state, {
    phase: 'alive',
    hp: 80,
    maxHp: 160,
    mp: 37,
    meso: 785,
    position: { x: 0, z: 24 },
    dyingUntilSeconds: null,
  })
  assert.deepEqual(respawned.events, [
    { type: 'respawn', position: { x: 0, z: 24 } },
    { type: 'clear-monster-aggro' },
  ])
})

test('살아 있는 상태나 이미 시작한 dying에는 death 타이머를 중복 생성하지 않는다', async () => {
  const { beginDeath } = await load('src/game/rules/respawn.ts')
  const alive = {
    phase: 'alive',
    hp: 1,
    maxHp: 175,
    mp: 90,
    meso: 1500,
    position: { x: 0, z: 0 },
    dyingUntilSeconds: null,
  }
  assert.deepEqual(beginDeath(alive, 0), { state: alive, events: [] })
  const dying = beginDeath({ ...alive, hp: 0 }, 1)
  assert.deepEqual(beginDeath(dying.state, 2), { state: dying.state, events: [] })
})
