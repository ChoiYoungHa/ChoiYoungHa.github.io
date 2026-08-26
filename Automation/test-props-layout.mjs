import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relative) => import(pathToFileURL(join(ROOT, relative)).href)
const placement = JSON.parse(readFileSync(join(ROOT, 'src/data/placement.json'), 'utf8'))
const mainPath = JSON.parse(readFileSync(join(ROOT, 'src/data/main-path.json'), 'utf8'))
const layout = await load('src/scene/village/propsLayout.ts')
const village = await load('src/scene/colliders/village.ts')
const centerline = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
// M6-16 adds park-only statue placeholders to placement.props. The M5-09
// audit intentionally owns only the four village prop kinds rendered by Props.tsx.
const villageProps = placement.props.filter((prop) => layout.PROP_KINDS.includes(prop.kind))

describe('M5-09 village prop placement', () => {
  const audit = layout.auditPropsLayout(villageProps, centerline, village.VILLAGE_COLLIDERS)

  test('has the approved count for every prop kind', () => {
    assert.deepEqual(audit.counts, layout.REQUIRED_PROP_COUNTS)
    assert.deepEqual(audit.countMismatches, [])
  })

  test('keeps every non-arch prop outside the path and feather band', () => {
    assert.deepEqual(audit.pathIntrusions, [])
  })

  test('places the entry arch perpendicular to the nearest path segment', () => {
    assert.deepEqual(audit.archMisalignments, [])
  })

  test('keeps all prop footprints inside the 250m world bounds', () => {
    assert.deepEqual(audit.boundaryViolations, [])
  })

  test('keeps prop footprints outside all house colliders', () => {
    assert.deepEqual(audit.houseOverlaps, [])
  })

  test('rejects representative path, boundary, house, and count regressions', () => {
    const pathRegression = structuredClone(villageProps)
    pathRegression.find((prop) => prop.kind === 'fence').position = [0, 24]
    assert.equal(layout.auditPropsLayout(pathRegression, centerline, village.VILLAGE_COLLIDERS).pathIntrusions.length, 1)

    const archRegression = structuredClone(villageProps)
    archRegression.find((prop) => prop.kind === 'arch').yaw = 0
    assert.equal(layout.auditPropsLayout(archRegression, centerline, village.VILLAGE_COLLIDERS).archMisalignments.length, 1)

    const boundaryRegression = structuredClone(villageProps)
    boundaryRegression.find((prop) => prop.kind === 'banner').position = [125, 0]
    assert.equal(layout.auditPropsLayout(boundaryRegression, centerline, village.VILLAGE_COLLIDERS).boundaryViolations.length, 1)

    const houseRegression = structuredClone(villageProps)
    houseRegression.find((prop) => prop.kind === 'stonewall').position = [10, 20]
    assert.ok(layout.auditPropsLayout(houseRegression, centerline, village.VILLAGE_COLLIDERS).houseOverlaps.length > 0)

    const countRegression = villageProps.slice(1)
    assert.equal(layout.auditPropsLayout(countRegression, centerline, village.VILLAGE_COLLIDERS).countMismatches.length, 1)
  })

  test('reports a valid production layout', () => {
    assert.equal(audit.invalidEntries.length, 0)
    assert.equal(audit.valid, true)
  })
})
