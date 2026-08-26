import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('park terraces define three nested rock levels inside the park', async () => {
  const terraces = await readJson('src/game/data/park-terraces.json')
  assert.deepEqual(terraces.parkCenter, { x: -80, z: 8 })
  assert.equal(terraces.parkRadiusMeters, 40)
  assert.equal(terraces.levels.length, 3)
  assert.deepEqual(terraces.levels.map((level) => level.id), ['lower', 'middle', 'upper'])
  assert.ok(terraces.levels.every((level) => level.heightMeters > 0 && level.radiusMeters > 0 && level.rockDensityPerSquareMeter > 0))
  assert.ok(terraces.levels[0].radiusMeters > terraces.levels[1].radiusMeters)
  assert.ok(terraces.levels[1].radiusMeters > terraces.levels[2].radiusMeters)
  assert.ok(terraces.levels[0].heightMeters < terraces.levels[1].heightMeters)
  assert.ok(terraces.levels[1].heightMeters < terraces.levels[2].heightMeters)
  assert.ok(Math.hypot(terraces.center.x + 80, terraces.center.z - 8) + terraces.levels[0].radiusMeters <= 40)
})

test('all eight spawn points are grounded, gentle, spaced, and clear of terraces and statues', async () => {
  const spawns = await readJson('src/game/data/spawns.json')
  const terraces = await readJson('src/game/data/park-terraces.json')
  const placement = await readJson('src/data/placement.json')
  const { sampleHeight } = await load('src/scene/terrain/heightmap.ts')
  const { slopeDegreesAt } = await load('src/scene/scatter/slopeMask.ts')
  const statues = placement.props.filter((prop) => prop.kind === 'statue')
  const terraceClearance = terraces.levels[0].radiusMeters + terraces.spawnClearanceMeters

  assert.equal(spawns.points.length, 8)
  assert.equal(statues.length, 2)
  for (const point of spawns.points) {
    assert.ok(Math.abs(point.y - sampleHeight(point.x, point.z)) <= 0.05, `${point.id} is not grounded`)
    assert.ok(slopeDegreesAt(point.x, point.z, sampleHeight) <= 25, `${point.id} slope exceeds 25 degrees`)
    assert.ok(Math.hypot(point.x + 80, point.z - 8) <= 40)
    assert.ok(Math.hypot(point.x - terraces.center.x, point.z - terraces.center.z) >= terraceClearance)
    for (const statue of statues) {
      assert.ok(Math.hypot(point.x - statue.position[0], point.z - statue.position[1]) >= terraces.statueClearanceMeters)
    }
  }
  for (let left = 0; left < spawns.points.length; left += 1) {
    for (let right = left + 1; right < spawns.points.length; right += 1) {
      const a = spawns.points[left]
      const b = spawns.points[right]
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 6)
    }
  }
})

test('statue placeholders reuse stonewall assets and pass existing prop clearance rules', async () => {
  const placement = await readJson('src/data/placement.json')
  const mainPath = await readJson('src/data/main-path.json')
  const { auditPropsLayout } = await load('src/scene/village/propsLayout.ts')
  const { VILLAGE_COLLIDERS } = await load('src/scene/colliders/village.ts')
  const statues = placement.props.filter((prop) => prop.kind === 'statue')
  const standIns = statues.map((statue) => ({ ...statue, kind: statue.runtimeMeshKind }))
  const centerline = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
  const audit = auditPropsLayout(standIns, centerline, VILLAGE_COLLIDERS)

  assert.ok(statues.every((statue) => statue.runtimeMeshKind === 'stonewall'))
  assert.deepEqual(audit.pathIntrusions, [])
  assert.deepEqual(audit.boundaryViolations, [])
  assert.deepEqual(audit.houseOverlaps, [])
})
