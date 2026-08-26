import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('Stan and Maya occupy sourced offsets from the village path', async () => {
  const placement = await readJson('src/data/placement.json')
  const mainPath = await readJson('src/data/main-path.json')
  const { distanceToPolyline } = await load('src/scene/village/propsLayout.ts')
  const centerline = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
  const byId = Object.fromEntries(placement.npcs.map((npc) => [npc.id, npc]))

  assert.deepEqual(Object.keys(byId).sort(), ['maya', 'stan'])
  assert.ok(Math.abs(distanceToPolyline({ x: byId.stan.position[0], z: byId.stan.position[1] }, centerline) - 2.5) < 1e-5)
  assert.ok(Math.abs(distanceToPolyline({ x: byId.maya.position[0], z: byId.maya.position[1] }, centerline) - 3) < 1e-5)
  assert.equal(byId.stan.sourceHouseId, 'village-04')
  assert.equal(byId.maya.sourceHouseId, 'village-02')
})

test('NPC footprints clear the path surface, houses, and world boundary', async () => {
  const placement = await readJson('src/data/placement.json')
  const mainPath = await readJson('src/data/main-path.json')
  const { distanceToPolyline } = await load('src/scene/village/propsLayout.ts')
  const { VILLAGE_COLLIDERS, isInsideVillageCollider } = await load('src/scene/colliders/village.ts')
  const centerline = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
  const pathHalfWidth = mainPath.widthMeters / 2

  for (const npc of placement.npcs) {
    const point = { x: npc.position[0], z: npc.position[1] }
    assert.ok(distanceToPolyline(point, centerline) >= pathHalfWidth + npc.collisionRadiusMeters)
    assert.ok(Math.abs(point.x) + npc.collisionRadiusMeters <= 125)
    assert.ok(Math.abs(point.z) + npc.collisionRadiusMeters <= 125)
    assert.equal(VILLAGE_COLLIDERS.some((collider) => isInsideVillageCollider(point, npc.collisionRadiusMeters, collider)), false)
  }
})

test('village gate trigger is centered on the existing arch and stays out of classified zones', async () => {
  const placement = await readJson('src/data/placement.json')
  const zones = await readJson('src/game/data/zones.json')
  const arch = placement.props.find((prop) => prop.kind === 'arch')
  const gate = zones.triggers.villageGate

  assert.deepEqual(gate.center, { x: arch.position[0], z: arch.position[1] })
  assert.equal(gate.shape, 'aabb')
  assert.equal(gate.cameraDistanceMeters.from, 6)
  assert.equal(gate.cameraDistanceMeters.to, 9)
  assert.equal(gate.cameraDistanceMeters.durationSeconds, 2)
  assert.equal(Object.hasOwn(zones.zones, 'villageGate'), false)
})
