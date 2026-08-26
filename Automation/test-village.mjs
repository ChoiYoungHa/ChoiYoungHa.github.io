import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relative) => import(pathToFileURL(join(ROOT, relative)).href)
const placement = JSON.parse(readFileSync(join(ROOT, 'src/data/placement.json'), 'utf8'))
const houses = await load('src/scene/village/houseGeometry.ts')
const roofs = await load('src/scene/village/roofGeometry.ts')
const collision = await load('src/scene/colliders/village.ts')

describe('M2 절차적 집·지붕', () => {
  test('집 3종은 4K tris 이하이고 socket 3개가 있다', () => {
    for (const id of ['house-a', 'house-b', 'house-c']) {
      const geometry = houses.createHouseGeometry(id)
      const tris = houses.triangleCount(geometry)
      assert.ok(tris > 0 && tris <= 4000, `${id}: ${tris} tris`)
      assert.deepEqual(houses.HOUSE_SOCKETS[id].rotationDeg, [0, 0, 0])
      assert.ok(houses.HOUSE_SOCKETS[id].position[1] > 0)
      geometry.dispose()
    }
  })

  test('지붕 3종은 윤곽 지표가 서로 다르고 vertex color를 가진다', () => {
    const silhouettes = new Set()
    for (const id of ['roof-a', 'roof-b', 'roof-c']) {
      const geometry = roofs.createRoofGeometry(id)
      assert.ok(geometry.getAttribute('color').count > 0)
      silhouettes.add(roofs.ROOF_METRICS[id].silhouette)
      geometry.dispose()
    }
    assert.equal(silhouettes.size, 3)
    assert.notEqual(roofs.ROOF_METRICS['roof-a'].pitchDeg, roofs.ROOF_METRICS['roof-b'].pitchDeg)
  })
})

describe('M2-23 배치', () => {
  test('8채이고 집·지붕 3종이 각 1회 이상이다', () => {
    assert.equal(placement.village.length, 8)
    assert.deepEqual([...new Set(placement.village.map((x) => x.house))].sort(), ['house-a', 'house-b', 'house-c'])
    assert.deepEqual([...new Set(placement.village.map((x) => x.roof))].sort(), ['roof-a', 'roof-b', 'roof-c'])
  })

  test('길 중심선에서 collider 외접원까지 1m보다 큰 여유가 있다', () => {
    const bad = collision.VILLAGE_COLLIDERS.filter((box) => collision.conservativePathClearance(box) <= 1)
    assert.equal(bad.length, 0, JSON.stringify(bad))
  })
})

describe('M2-26·27 마을 collider', () => {
  test('집당 box 1~3개이고 내부 전용 collider는 없다', () => {
    const counts = new Map()
    for (const box of collision.VILLAGE_COLLIDERS) counts.set(box.buildingId, (counts.get(box.buildingId) ?? 0) + 1)
    assert.equal(counts.size, 8)
    for (const count of counts.values()) assert.ok(count >= 1 && count <= 3)
  })

  test('각 외벽 중심에서 resolve 후 관통 0이고 y는 보존된다', () => {
    for (const box of collision.VILLAGE_COLLIDERS) {
      const input = { x: box.x, y: 7.5, z: box.z }
      const output = collision.resolveVillageCollision(input)
      assert.equal(output.y, input.y)
      const remaining = collision.VILLAGE_COLLIDERS.filter((other) =>
        collision.isInsideVillageCollider(output, 0.35, other),
      )
      assert.equal(remaining.length, 0, `${box.buildingId}: ${JSON.stringify(remaining)}`)
    }
  })
})
