import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M1-01 · 05 · 08 · 17 · 19 계약 테스트.
 *
 * 실행: node --test Automation/test-scatter.mjs
 * 브라우저·빌드·GPU 를 쓰지 않는다(codex-A 의 M0-b 성능 측정과 같은 PC를 쓰므로).
 * Node 24 가 `.ts` 를 그대로 벗겨 실행한다. 새 패키지 없음.
 *
 * `src/` 가 아니라 `Automation/` 인 이유는 R12-C 와 같다:
 * tsconfig.app.json 의 `types: ["vite/client"]` 때문에 src 안에서는 node:test 타입이
 * 해석되지 않아 `tsc -b` 가 깨진다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const bounds = await load('src/scene/bounds.ts')
const rand = await load('src/scene/scatter/seededRandom.ts')
const mask = await load('src/scene/scatter/exclusionMask.ts')
const slope = await load('src/scene/scatter/slopeMask.ts')

const mainPath = readJson('src/data/main-path.json')
const vistas = readJson('src/data/vistas.json')
const qualityPresets = readJson('src/data/quality-presets.json')
const centerline = mainPath.waypoints.map((w) => ({ x: w.x, z: w.z }))

describe('M1-01 월드 경계 — X/Z -125~125m', () => {
  test('폭·깊이 250m', () => {
    assert.equal(bounds.WORLD_HALF_EXTENT, 125)
    assert.equal(bounds.WORLD_SIZE, 250)
    assert.deepEqual({ ...bounds.WORLD_BOUNDS }, { minX: -125, maxX: 125, minZ: -125, maxZ: 125 })
  })

  test('플레이어 이탈 방지 값이 존재하고 경계보다 안쪽이다', () => {
    assert.equal(typeof bounds.PLAYER_EDGE_MARGIN, 'number')
    assert.ok(bounds.PLAYER_EDGE_MARGIN > 0)
    assert.equal(bounds.PLAYER_HALF_EXTENT, 125 - bounds.PLAYER_EDGE_MARGIN)
    assert.ok(bounds.PLAYER_HALF_EXTENT < bounds.WORLD_HALF_EXTENT)
  })

  test('clampToPlayerBounds 가 경계 밖을 되돌린다', () => {
    const h = bounds.PLAYER_HALF_EXTENT
    assert.deepEqual(bounds.clampToPlayerBounds(999, -999), { x: h, z: -h })
    assert.deepEqual(bounds.clampToPlayerBounds(10, -20), { x: 10, z: -20 })
    assert.equal(bounds.isInsidePlayerBounds(h + 0.1, 0), false)
    assert.equal(bounds.isInsideWorld(125, -125), true)
    assert.equal(bounds.isInsideWorld(125.1, 0), false)
  })
})

describe('M1-05 길 중심선 — waypoint 8개, 총 길이 120~180m', () => {
  test('waypoint 정확히 8개, index 0..7 연속', () => {
    assert.equal(mainPath.waypoints.length, 8)
    assert.deepEqual(
      mainPath.waypoints.map((w) => w.index),
      [0, 1, 2, 3, 4, 5, 6, 7],
    )
    for (const w of mainPath.waypoints) {
      assert.equal(typeof w.x, 'number')
      assert.equal(typeof w.z, 'number')
      assert.ok(w.label.length > 0)
    }
  })

  test('총 길이가 120~180m', () => {
    const length = mask.centerlineLength(centerline)
    assert.ok(length >= 120 && length <= 180, `총 길이 ${length.toFixed(2)}m`)
  })

  test('모든 waypoint 가 250m 경계 안', () => {
    for (const w of mainPath.waypoints) {
      assert.ok(bounds.isInsideWorld(w.x, w.z), `경계 밖: ${JSON.stringify(w)}`)
      assert.ok(bounds.isInsidePlayerBounds(w.x, w.z), `플레이어 범위 밖: ${JSON.stringify(w)}`)
    }
  })

  test('연속 waypoint 가 겹치지 않는다(구간 길이 > 0)', () => {
    for (let i = 1; i < centerline.length; i++) {
      const d = Math.hypot(
        centerline[i].x - centerline[i - 1].x,
        centerline[i].z - centerline[i - 1].z,
      )
      assert.ok(d > 1, `구간 ${i - 1}->${i} 가 너무 짧다: ${d}`)
    }
  })
})

describe('M1-08 전망 지점 — marker 정확히 3개', () => {
  test('marker 3개이고 각각 position·target 을 가진다', () => {
    assert.equal(vistas.markers.length, 3)
    for (const m of vistas.markers) {
      assert.equal(typeof m.position.x, 'number')
      assert.equal(typeof m.position.z, 'number')
      assert.equal(typeof m.target.x, 'number')
      assert.equal(typeof m.target.z, 'number')
      assert.ok(m.id.length > 0)
      // 자기 자신을 보는 marker 는 시선이 정의되지 않는다
      const d = Math.hypot(m.target.x - m.position.x, m.target.z - m.position.z)
      assert.ok(d > 1, `${m.id} 의 시선 거리가 ${d}`)
    }
  })

  test('시작·중간·마을 3종이 모두 있고 좌표가 경계 안', () => {
    assert.deepEqual(
      vistas.markers.map((m) => m.id).sort(),
      ['vista-mid', 'vista-start', 'vista-village'],
    )
    for (const m of vistas.markers) {
      assert.ok(bounds.isInsideWorld(m.position.x, m.position.z), `${m.id} position 경계 밖`)
      assert.ok(bounds.isInsideWorld(m.target.x, m.target.z), `${m.id} target 경계 밖`)
    }
  })

  test('main-path 랜드마크와 모순이 없다', () => {
    const byId = Object.fromEntries(vistas.markers.map((m) => [m.id, m]))
    const { heroTree, villageCenter } = mainPath.landmarks
    // 시작·중간은 거대 수목을 본다
    assert.deepEqual(byId['vista-start'].target, heroTree)
    assert.deepEqual(byId['vista-mid'].target, heroTree)
    // 마을 전망은 수목 밑동에서 마을을 되돌아본다(계획서 §4-3 45~60초 구간)
    assert.deepEqual(byId['vista-village'].position, heroTree)
    assert.deepEqual(byId['vista-village'].target, villageCenter)
    // 수목 밑동은 길의 마지막 waypoint 와 같은 지점이어야 한다
    const last = mainPath.waypoints[mainPath.waypoints.length - 1]
    assert.deepEqual({ x: last.x, z: last.z }, heroTree)
    // 스폰은 길의 첫 waypoint
    const first = mainPath.waypoints[0]
    assert.deepEqual({ x: first.x, z: first.z }, mainPath.landmarks.spawn)
  })
})

describe('M1-17 seeded 산포 — 같은 seed 결과 hash 3회 동일', () => {
  const OPTS = { count: 200, halfExtent: bounds.WORLD_HALF_EXTENT }

  test('같은 seed 로 3회 생성하면 hash 가 같다', () => {
    const hashes = [1, 2, 3].map(() => rand.hashScatter(rand.scatter(20260826, OPTS)))
    assert.equal(new Set(hashes).size, 1, `hash 들이 다르다: ${hashes.join(' / ')}`)
    assert.match(hashes[0], /^[0-9a-f]{8}$/)
  })

  test('다른 seed 는 다른 결과를 낸다', () => {
    const a = rand.hashScatter(rand.scatter(1, OPTS))
    const b = rand.hashScatter(rand.scatter(2, OPTS))
    assert.notEqual(a, b)
  })

  test('mulberry32 수열 자체가 결정론이고 0..1 범위다', () => {
    const seq = (s) => Array.from({ length: 500 }, () => rand.mulberry32(s)()).slice(0, 1)
    assert.deepEqual(seq(42), seq(42))
    const rng = rand.mulberry32(7)
    for (let i = 0; i < 10000; i++) {
      const v = rng()
      assert.ok(v >= 0 && v < 1, `범위 밖: ${v}`)
    }
  })

  test('산포 결과가 요청 개수·경계를 지킨다', () => {
    const pts = rand.scatter(99, OPTS)
    assert.equal(pts.length, 200)
    for (const p of pts) {
      assert.ok(bounds.isInsideWorld(p.x, p.z), `경계 밖: ${p.x},${p.z}`)
      assert.ok(p.rotationY >= 0 && p.rotationY < Math.PI * 2)
      assert.ok(p.scale >= 0.85 && p.scale <= 1.25)
    }
  })

  test('hashSeed 는 문자열 seed 를 안정적으로 32비트로 만든다', () => {
    assert.equal(rand.hashSeed('conifer'), rand.hashSeed('conifer'))
    assert.notEqual(rand.hashSeed('conifer'), rand.hashSeed('rock'))
    assert.ok(rand.hashSeed('conifer') >>> 0 === rand.hashSeed('conifer'))
  })
})

describe('M1-19 길 제외 마스크 — 길 위 겹침 0', () => {
  test('중심선 위 100점이 전부 제외된다', () => {
    const samples = mask.sampleCenterline(centerline, 100)
    assert.equal(samples.length, 100)
    const overlaps = samples.filter((p) => !mask.isExcludedBy(p.x, p.z, centerline))
    assert.equal(overlaps.length, 0, `길 위인데 제외 안 된 점 ${overlaps.length}개`)
  })

  test('반경 경계 동작 — 안쪽은 제외, 바깥은 통과', () => {
    const p = mask.sampleCenterline(centerline, 3)[1] // 길 중간의 한 점
    assert.equal(mask.isExcludedBy(p.x, p.z, centerline), true)
    assert.equal(mask.isExcludedBy(p.x + 1.9, p.z, centerline), true)
    // 정확히 반경이면 제외하지 않는다(미만 조건)
    assert.equal(mask.isExcludedBy(p.x + 40, p.z + 40, centerline), false)
    assert.equal(mask.PATH_EXCLUSION_RADIUS, 2)
  })

  test('createPathExclusion 이 2인자 isExcluded(x, z) 를 만든다', () => {
    const isExcluded = mask.createPathExclusion(centerline)
    assert.equal(typeof isExcluded, 'function')
    assert.equal(isExcluded.length, 2)
    const on = mask.sampleCenterline(centerline, 5)[2]
    assert.equal(isExcluded(on.x, on.z), true)
    assert.equal(isExcluded(-120, 120), false)
  })

  test('★ 산포 200개를 마스크와 함께 돌리면 길 위 겹침이 0이다', () => {
    const isExcluded = mask.createPathExclusion(centerline)
    const pts = rand.scatter(20260826, {
      count: 200,
      halfExtent: bounds.WORLD_HALF_EXTENT,
      reject: isExcluded,
    })
    assert.equal(pts.length, 200)
    const bad = pts.filter((p) => mask.distanceToCenterline(p.x, p.z, centerline) < 2)
    assert.equal(bad.length, 0, `길 반경 2m 안에 배치된 점 ${bad.length}개`)
  })

  test('마스크를 걸어도 결정론이 유지된다(3회 hash 동일)', () => {
    const isExcluded = mask.createPathExclusion(centerline)
    const opts = { count: 150, halfExtent: bounds.WORLD_HALF_EXTENT, reject: isExcluded }
    const hashes = [1, 2, 3].map(() => rand.hashScatter(rand.scatter(777, opts)))
    assert.equal(new Set(hashes).size, 1, `hash 들이 다르다: ${hashes.join(' / ')}`)
  })

  test('distanceToSegment 가 선분 밖에서는 끝점 거리를 준다', () => {
    const a = { x: 0, z: 0 }
    const b = { x: 10, z: 0 }
    assert.equal(mask.distanceToSegment(5, 3, a, b), 3) // 선분 위 투영
    assert.equal(mask.distanceToSegment(-4, 0, a, b), 4) // a 쪽 바깥
    assert.equal(mask.distanceToSegment(14, 0, a, b), 4) // b 쪽 바깥
  })
})

describe('M1-18 경사 마스크 — 25도 이상 배치 0', () => {
  const plane = (degrees) => {
    const gradient = Math.tan((degrees * Math.PI) / 180)
    return (x) => x * gradient
  }

  test('평지와 24도 지형은 허용하고 25도부터 제외한다', () => {
    assert.equal(slope.isExcludedBySlope(0, 0, plane(0)), false)
    assert.equal(slope.isExcludedBySlope(0, 0, plane(24)), false)
    assert.equal(slope.isExcludedBySlope(0, 0, plane(25)), true)
    assert.equal(slope.isExcludedBySlope(0, 0, plane(26)), true)
  })

  test('가파른 평면의 서로 다른 10점 모두 배치 금지다', () => {
    const reject = slope.createSlopeExclusion(plane(30))
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i - 5, z: i * 0.75 - 3 }))
    assert.equal(points.filter((p) => !reject(p.x, p.z)).length, 0)
    assert.equal(reject.length, 2)
  })

  test('scatter 결과에는 경사 25도 이상 지점이 없다', () => {
    const height = (x) => (x < 0 ? x * Math.tan((30 * Math.PI) / 180) : 0)
    const reject = slope.createSlopeExclusion(height)
    const points = rand.scatter(20260826, { count: 100, halfExtent: 20, reject })
    assert.equal(points.length, 100)
    assert.equal(points.filter((p) => slope.slopeDegreesAt(p.x, p.z, height) >= 25).length, 0)
  })

  test('0 이하 표본 간격은 거부한다', () => {
    assert.throws(() => slope.slopeDegreesAt(0, 0, plane(0), 0), RangeError)
  })
})

describe('R19-A 월드 전체 foliage 후보', () => {
  test('low 밀도 후보 수가 상한 안이고 같은 seed hash가 같다', () => {
    const { count, radius } = qualityPresets.low.grassInstances
    const candidateTotal = Math.min(
      200_000,
      Math.ceil((count / (Math.PI * radius * radius)) * bounds.WORLD_SIZE * bounds.WORLD_SIZE),
    )
    assert.equal(candidateTotal, 190_986)
    assert.ok(candidateTotal <= 200_000)

    const grassCount = Math.floor(candidateTotal * 0.7)
    const options = { count: grassCount, halfExtent: bounds.WORLD_HALF_EXTENT }
    const first = rand.hashScatter(rand.scatter(rand.hashSeed('m1-grass'), options))
    const second = rand.hashScatter(rand.scatter(rand.hashSeed('m1-grass'), options))
    assert.equal(first, second)
  })
})
