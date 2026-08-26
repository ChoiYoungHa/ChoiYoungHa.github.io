import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M2-10 충돌 proxy + M2-02~06 지오메트리 예산 계약 테스트.
 *
 * 실행: node --test Automation/test-colliders.mjs
 * 브라우저·GPU 없이 돈다 — 콜라이더와 지오메트리 생성기가 three 비의존이라 가능하다.
 *
 * `src/` 가 아니라 `Automation/` 인 이유는 R12-C 와 같다:
 * tsconfig.app.json 의 `types: ["vite/client"]` 때문에 src 안에서는 node:test 타입이
 * 해석되지 않아 `tsc -b` 가 깨진다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const col = await load('src/scene/colliders/heroTree.ts')
const vil = await load('src/scene/colliders/village.ts')
const hero = await load('src/scene/hero/heroTreeGeometry.ts')
const hm = await load('src/scene/terrain/heightmap.ts')
const { createRaycastController } = await load('src/player/controllers/raycast.ts')

const placement = readJson('src/data/placement.json')
const mainPath = readJson('src/data/main-path.json')
const vistas = readJson('src/data/vistas.json')
const TREE = placement.heroTree

describe('M2-10 줄기 충돌 proxy — 순수 함수', () => {
  test('반경은 밑동 반경 + 플레이어 반폭', () => {
    assert.equal(col.PLAYER_RADIUS, 0.4)
    assert.equal(col.HERO_TRUNK_RADIUS, hero.HERO_TREE.trunkBaseDiameter / 2 + col.PLAYER_RADIUS)
    assert.equal(col.HERO_TRUNK_RADIUS, 3.0)
  })

  test('밖에 있으면 좌표를 그대로 돌려준다', () => {
    const c = col.heroTreeCollider(TREE)
    const p = { x: TREE.x + 10, z: TREE.z }
    assert.equal(col.resolveAgainstCircle(p, c), p)
  })

  test('안에 있으면 반경 밖으로 밀어낸다', () => {
    const c = col.heroTreeCollider(TREE)
    const out = col.resolveAgainstCircle({ x: TREE.x + 1, z: TREE.z }, c)
    const d = Math.hypot(out.x - TREE.x, out.z - TREE.z)
    assert.ok(d >= col.HERO_TRUNK_RADIUS, `밀어낸 거리 ${d}`)
  })

  test('중심에 정확히 있어도 NaN 이 되지 않는다', () => {
    const c = col.heroTreeCollider(TREE)
    const out = col.resolveAgainstCircle({ x: TREE.x, z: TREE.z }, c)
    assert.ok(Number.isFinite(out.x) && Number.isFinite(out.z))
    assert.ok(Math.hypot(out.x - TREE.x, out.z - TREE.z) >= col.HERO_TRUNK_RADIUS)
  })
})

describe('M2-10 완료 조건 — 10회 접근 시 줄기 관통 0', () => {
  /**
   * 10방향에서 줄기를 향해 8초간 달려 들어간다.
   * 컨트롤러를 실제로 돌리므로 접지·경사·충돌이 모두 걸린 상태의 결과다.
   */
  const APPROACHES = 10
  const results = []
  for (let i = 0; i < APPROACHES; i++) {
    const a = (i / APPROACHES) * Math.PI * 2
    const startX = TREE.x + Math.cos(a) * 25
    const startZ = TREE.z + Math.sin(a) * 25
    // 나무를 향하는 yaw (forward=1 일 때 이동은 (-sin yaw, -cos yaw))
    const yaw = Math.atan2(-(TREE.x - startX), -(TREE.z - startZ))
    const c = createRaycastController(
      hm.sampleGround,
      { x: startX, y: 0, z: startZ },
      {},
      (pos) => col.resolveCollision(pos, [col.heroTreeCollider(TREE)]),
    )
    let minDist = Infinity
    let last = null
    for (let n = 0; n < Math.round(8 / (1 / 60)); n++) {
      last = c.step({ forward: 1, strafe: 0, run: true, yaw }, 1 / 60)
      minDist = Math.min(minDist, Math.hypot(last.position.x - TREE.x, last.position.z - TREE.z))
    }
    results.push({ i, angleDeg: Math.round((a * 180) / Math.PI), minDist, final: last.position })
  }

  test('10회 모두 줄기 반경 안으로 들어가지 않는다', () => {
    const EPS = 1e-9
    const breaches = results.filter((r) => r.minDist < col.HERO_TRUNK_RADIUS - EPS)
    assert.equal(
      breaches.length,
      0,
      `관통 ${breaches.length}회: ` + breaches.map((b) => `${b.angleDeg}deg d=${b.minDist.toFixed(4)}`).join(', '),
    )
  })

  test('10회 모두 실제로 나무 근처까지 접근했다(테스트가 헛돌지 않았다)', () => {
    const reached = results.filter((r) => r.minDist <= col.HERO_TRUNK_RADIUS + 0.5)
    assert.equal(reached.length, APPROACHES, `접근 성공 ${reached.length}/${APPROACHES}`)
  })

  test('밀려난 뒤에도 좌표가 유한하다', () => {
    for (const r of results) {
      assert.ok(Number.isFinite(r.final.x) && Number.isFinite(r.final.y) && Number.isFinite(r.final.z))
    }
  })
})

describe('M2-02~06 지오메트리 예산 계약', () => {
  const lod0 = hero.buildHeroTree(0)
  const lod1 = hero.buildHeroTree(1)

  test('모듈 5~7개 (계획서 §1-2)', () => {
    const names = new Set(lod0.modules.map((m) => m.name))
    assert.ok(names.size >= 5 && names.size <= 7, `모듈 ${names.size}개`)
  })

  test('LOD0 tris ≤ 120,000 (계획서 §4-1)', () => {
    assert.ok(lod0.triangleCount <= 120000, `${lod0.triangleCount} tris`)
    assert.ok(lod0.triangleCount > 0)
  })

  test('LOD1 tris ≤ LOD0 의 50%', () => {
    assert.ok(
      lod1.triangleCount <= lod0.triangleCount * 0.5,
      `LOD1 ${lod1.triangleCount} / LOD0 ${lod0.triangleCount}`,
    )
  })

  test('피벗이 밑동 — minY = 0', () => {
    assert.equal(lod0.bounds.minY, 0)
    assert.equal(lod1.bounds.minY, 0)
  })

  test('높이 40~70m (M2-01 브리프)', () => {
    assert.ok(lod0.bounds.maxY >= 40 && lod0.bounds.maxY <= 70, `${lod0.bounds.maxY}m`)
  })

  test('결정론 — 같은 seed 는 같은 정점', () => {
    const a = hero.buildHeroTree(0)
    const b = hero.buildHeroTree(0)
    assert.equal(a.positions.length, b.positions.length)
    for (let i = 0; i < a.positions.length; i += 211) assert.equal(a.positions[i], b.positions[i])
  })

  test('배열 길이가 서로 맞는다(정점당 pos/normal/color 3개씩)', () => {
    assert.equal(lod0.positions.length, lod0.triangleCount * 9)
    assert.equal(lod0.normals.length, lod0.positions.length)
    assert.equal(lod0.colors.length, lod0.positions.length)
  })

  test('법선이 전부 단위벡터다', () => {
    for (let i = 0; i < lod0.normals.length; i += 3 * 97) {
      const l = Math.hypot(lod0.normals[i], lod0.normals[i + 1], lod0.normals[i + 2])
      assert.ok(Math.abs(l - 1) < 1e-5, `법선 길이 ${l}`)
    }
  })
})

describe('M2-08 배치 정합', () => {
  test('placement · main-path 의 heroTree 좌표가 같고 vista-village 는 줄기 밖 밑동 6m 안', () => {
    const mp = mainPath.landmarks.heroTree
    const vv = vistas.markers.find((m) => m.id === 'vista-village').position
    assert.deepEqual({ x: TREE.x, z: TREE.z }, { x: mp.x, z: mp.z })
    // R22-A(M2-30): vista-village 는 줄기 중심이 아니라 밑동 근처다(test-scatter.mjs 와 같은 규칙, master 판정 B).
    const dv = Math.hypot(vv.x - TREE.x, vv.z - TREE.z)
    assert.ok(dv > col.HERO_TRUNK_RADIUS && dv <= 6, `vista-village 거리 ${dv.toFixed(2)}m`)
  })

  test('heroTree 가 250m 경계 안이고 지면 높이가 유한하다', () => {
    const h = hm.sampleGround(TREE.x, TREE.z)
    assert.notEqual(h, null)
    assert.equal(Number.isFinite(h), true)
  })

  test('LOD 전환 거리가 양수이고 vista-start 거리보다 짧다', () => {
    const start = vistas.markers.find((m) => m.id === 'vista-start').position
    const d = Math.hypot(TREE.x - start.x, TREE.z - start.z)
    assert.ok(TREE.lodSwitchDistanceMeters > 0)
    assert.ok(
      TREE.lodSwitchDistanceMeters < d,
      `전환 ${TREE.lodSwitchDistanceMeters}m 가 vista-start 거리 ${d.toFixed(1)}m 보다 멀다 — 먼 전망에서 LOD0 를 쓰게 된다`,
    )
  })
})

describe('R22-A 통합 — Controller 가 쓰는 합성 resolver(수목→마을)', () => {
  /**
   * Controller.tsx 가 컨트롤러에 넘기는 것과 **같은 함수**를 여기서 만든다.
   * 두 곳이 갈라지면 이 테스트가 통과해도 게임은 관통한다 — 형태를 1:1 로 맞춘다.
   */
  const resolve = (pos) =>
    vil.resolveVillageCollision(
      col.resolveCollision(pos, [col.heroTreeCollider(TREE)]),
      col.PLAYER_RADIUS,
    )

  const COLLIDERS = vil.VILLAGE_COLLIDERS
  /** 콜라이더 로컬 좌표에서 반경까지 남은 침투 깊이. 양수면 관통이다. */
  const penetration = (p) => {
    let worst = -Infinity
    for (const c of COLLIDERS) {
      const dx = p.x - c.x
      const dz = p.z - c.z
      const cos = Math.cos(c.rotationY)
      const sin = Math.sin(c.rotationY)
      const lx = Math.abs(dx * cos + dz * sin)
      const lz = Math.abs(-dx * sin + dz * cos)
      const d = Math.min(c.halfX + col.PLAYER_RADIUS - lx, c.halfZ + col.PLAYER_RADIUS - lz)
      worst = Math.max(worst, d)
    }
    return worst
  }

  test('합성이 수목·마을 두 곳 모두에서 밀어낸다', () => {
    const inTree = resolve({ x: TREE.x + 0.5, z: TREE.z })
    assert.ok(Math.hypot(inTree.x - TREE.x, inTree.z - TREE.z) >= col.HERO_TRUNK_RADIUS)
    const house = COLLIDERS[0]
    const inHouse = resolve({ x: house.x, z: house.z })
    assert.ok(penetration(inHouse) <= 1e-6, `침투 ${penetration(inHouse)}`)
  })

  /**
   * 집 8채 × 8방향에서 20m 밖에서 달려 들어간다. 컨트롤러를 실제로 돌리므로
   * 접지·경사·합성 충돌이 전부 걸린 상태의 결과다(M2-10 수목 테스트와 같은 방식).
   */
  const village = placement.village
  const DIRECTIONS = 8
  const runs = []
  for (const building of village) {
    const [bx, bz] = building.position
    for (let i = 0; i < DIRECTIONS; i++) {
      const a = (i / DIRECTIONS) * Math.PI * 2
      const startX = bx + Math.cos(a) * 20
      const startZ = bz + Math.sin(a) * 20
      const yaw = Math.atan2(-(bx - startX), -(bz - startZ))
      const c = createRaycastController(hm.sampleGround, { x: startX, y: 0, z: startZ }, {}, resolve)
      let worst = -Infinity
      let minDist = Infinity
      let last = null
      for (let n = 0; n < Math.round(8 / (1 / 60)); n++) {
        last = c.step({ forward: 1, strafe: 0, run: true, yaw }, 1 / 60)
        worst = Math.max(worst, penetration(last.position))
        minDist = Math.min(minDist, Math.hypot(last.position.x - bx, last.position.z - bz))
      }
      runs.push({
        id: building.id,
        angleDeg: Math.round((a * 180) / Math.PI),
        worst,
        minDist,
        final: last.position,
        finalPenetration: penetration(last.position),
      })
    }
  }

  test('8채 × 8방향 = 64회 접근에서 외벽 관통 0', () => {
    const EPS = 1e-6
    const breaches = runs.filter((r) => r.worst > EPS)
    assert.equal(
      breaches.length,
      0,
      `관통 ${breaches.length}회: ` +
        breaches.slice(0, 5).map((b) => `${b.id}@${b.angleDeg}deg d=${b.worst.toFixed(4)}`).join(', '),
    )
  })

  /**
   * 마을은 밀집해 있어서 20m 링 위의 출발점이 **옆집 안**에 놓이는 방향이 있다(실측 12/64).
   * 그 회차는 목표 집이 아니라 옆집 벽에 막혀 멈춘다 — 이것도 콜라이더가 일한 증거다.
   * 그래서 "전부 도달"이 아니라 "도달했거나 벽에 닿아 멈췄다"로 검사한다.
   */
  test('64회 모두 도달했거나 벽에 막혔다(테스트가 헛돌지 않았다)', () => {
    const reached = runs.filter((r) => r.minDist <= 8)
    const blocked = runs.filter((r) => r.minDist > 8 && r.finalPenetration > -0.05)
    assert.equal(reached.length + blocked.length, runs.length, `도달 ${reached.length} + 벽접촉 ${blocked.length}`)
    assert.ok(reached.length >= runs.length * 0.75, `도달 ${reached.length}/${runs.length}`)
  })

  test('밀려난 뒤에도 좌표가 유한하다', () => {
    for (const r of runs) {
      assert.ok(Number.isFinite(r.final.x) && Number.isFinite(r.final.y) && Number.isFinite(r.final.z))
    }
  })
})
