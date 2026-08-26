import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readZones = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/zones.json'), 'utf8'))

function rawContains(zone, point) {
  if (zone.shape === 'circle') {
    return Math.hypot(point.x - zone.center.x, point.z - zone.center.z) <= zone.radiusMeters
  }
  return point.x >= zone.min.x && point.x <= zone.max.x
    && point.z >= zone.min.z && point.z <= zone.max.z
}

test('지역 좌표는 main-path P0·villageCenter와 집 8채 범위에서 계산됐다', async () => {
  const data = await readZones()
  assert.equal(data.hysteresisMeters, 2)
  assert.deepEqual(data.priority, ['forest', 'village', 'park'])
  assert.deepEqual(data.zones.forest, {
    shape: 'circle',
    center: { x: 0, z: 24 },
    radiusMeters: 25,
    excludes: [],
    source: 'src/data/main-path.json waypoints[0] (P0)',
  })
  assert.deepEqual(data.zones.village.min, { x: -25, z: -25 })
  assert.deepEqual(data.zones.village.max, { x: 21, z: 28 })
  assert.deepEqual(data.zones.village.excludes, ['forest'])
  assert.deepEqual(data.zones.park.center, { x: -80, z: 8 })
  assert.equal(data.zones.park.radiusMeters, 40)
})

test('P0·마을 북단·공원 중심·외부를 한 지역으로 분류한다', async () => {
  const { classify } = await load('src/game/world/zones.ts')
  assert.equal(classify({ x: 0, z: 24 }), 'forest')
  assert.equal(classify({ x: -9, z: -6 }), 'village')
  assert.equal(classify({ x: -80, z: 8 }), 'park')
  assert.equal(classify({ x: 100, z: 100 }), null)
})

test('유효 볼륨은 1m 격자 전역에서 세 지역 겹침이 0이다', async () => {
  const data = await readZones()
  for (let x = -130; x <= 130; x += 1) {
    for (let z = -130; z <= 130; z += 1) {
      const point = { x, z }
      const memberships = Object.values(data.zones).filter((zone) => {
        if (!rawContains(zone, point)) return false
        return zone.excludes.every((excluded) => !rawContains(data.zones[excluded], point))
      })
      assert.ok(memberships.length <= 1, `overlap at ${x},${z}`)
    }
  }
})

test('2m 히스테리시스가 숲 경계 왕복의 enter 이벤트를 한 번으로 억제한다', async () => {
  const { step } = await load('src/game/world/zones.ts')
  let state = { zone: null }
  const events = []
  for (const point of [
    { x: 24.9, z: 24 },
    { x: 25.1, z: 24 },
    { x: 24.8, z: 24 },
    { x: 25.2, z: 24 },
    { x: 24.7, z: 24 },
  ]) {
    const result = step(state, point)
    state = result.state
    events.push(...result.events)
  }

  assert.deepEqual(events, [{ type: 'enter', zone: 'forest' }])
  const exited = step(state, { x: 27.1, z: 24 })
  assert.deepEqual(exited.events, [{ type: 'exit', zone: 'forest' }])
})

test('숲에서 마을로 멀리 이동하면 exit 다음 enter가 한 번씩 발생한다', async () => {
  const { step } = await load('src/game/world/zones.ts')
  const forest = step({ zone: null }, { x: 0, z: 24 }).state
  const village = step(forest, { x: -9, z: -6 })

  assert.equal(village.state.zone, 'village')
  assert.deepEqual(village.events, [
    { type: 'exit', zone: 'forest' },
    { type: 'enter', zone: 'village' },
  ])
})
