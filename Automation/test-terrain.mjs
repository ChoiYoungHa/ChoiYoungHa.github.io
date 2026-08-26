import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M1-02·03(절차적 대체) 계약 테스트.
 * 실행: node --test Automation/test-terrain.mjs
 *
 * 요구: 250m 범위 · 최대 기복 ≤12m · 경사 ≤25° · 길 중심선 반경 6m 평탄 ·
 *       마을 예정지 평지 · 동굴/내부 0.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const hm = await load('src/scene/terrain/heightmap.ts')
const bounds = await load('src/scene/bounds.ts')
const mask = await load('src/scene/scatter/exclusionMask.ts')
const mainPath = readJson('src/data/main-path.json')
const centerline = mainPath.waypoints.map((w) => ({ x: w.x, z: w.z }))

const HALF = bounds.WORLD_HALF_EXTENT
/** 지형 메시와 같은 간격으로 훑는다(250m / 256 ≈ 0.977m). */
const STEP = 250 / 256

/** 도메인 전체를 격자로 훑어 통계를 낸다. 한 번만 돌고 재사용한다. */
const stats = (() => {
  let min = Infinity
  let max = -Infinity
  let maxSlopeDeg = 0
  let worst = null
  let samples = 0
  for (let z = -HALF; z <= HALF; z += STEP) {
    for (let x = -HALF; x <= HALF; x += STEP) {
      const h = hm.sampleHeight(x, z)
      assert.equal(Number.isFinite(h), true, `높이가 유한하지 않다: (${x},${z}) -> ${h}`)
      if (h < min) min = h
      if (h > max) max = h
      samples++
      // 인접 격자와의 경사(x·z 두 방향)
      for (const [dx, dz] of [
        [STEP, 0],
        [0, STEP],
      ]) {
        const nx = x + dx
        const nz = z + dz
        if (Math.abs(nx) > HALF || Math.abs(nz) > HALF) continue
        const rise = Math.abs(hm.sampleHeight(nx, nz) - h)
        const deg = (Math.atan2(rise, STEP) * 180) / Math.PI
        if (deg > maxSlopeDeg) {
          maxSlopeDeg = deg
          worst = { x, z, deg }
        }
      }
    }
  }
  return { min, max, relief: max - min, maxSlopeDeg, worst, samples }
})()

describe('M1-02·03 절차적 지형 — 기복·경사', () => {
  test('격자 전수 샘플이 유한하고 충분히 조밀하다', () => {
    assert.ok(stats.samples > 60000, `샘플 ${stats.samples}개`)
  })

  test(`최대 기복 ≤ 12m (실측 ${stats.relief.toFixed(3)}m)`, () => {
    assert.ok(stats.relief <= hm.MAX_RELIEF, `기복 ${stats.relief.toFixed(3)}m`)
    // 완전 평면이면 지형이라 할 수 없다
    assert.ok(stats.relief >= 3, `기복이 너무 작다: ${stats.relief.toFixed(3)}m`)
  })

  test(`최대 경사 ≤ 25° (실측 ${stats.maxSlopeDeg.toFixed(3)}°)`, () => {
    assert.ok(
      stats.maxSlopeDeg <= 25,
      `경사 ${stats.maxSlopeDeg.toFixed(3)}° @ ${JSON.stringify(stats.worst)}`,
    )
  })

  test('컨트롤러 경사 한계 40°보다 낮다 — 어디서도 막히지 않는다', () => {
    assert.ok(stats.maxSlopeDeg < 40)
  })

  /**
   * ★ 위 격자(0.977m) 검사만으로는 부족하다. 컨트롤러는 한 프레임에 3.2/143 ≈ 0.022m 만
   * 전진하고 그 간격으로 지면을 두 번 샘플한다. 0.977m 격자에서 9.7° 로 보이는 높이 계단이
   * 0.022m 간격에서는 82° 가 된다 — 실제로 R17-A 에서 플레이어가 보이지 않는 벽에 막혔다.
   * 그래서 **소비자가 실제로 쓰는 간격**으로 다시 잰다.
   */
  test('컨트롤러 샘플 간격(≈0.022m)에서도 경사 ≤ 40° — 길 주변 전수', () => {
    const STEP = 3.2 / 143
    const samples = mask.sampleCenterline(centerline, 400)
    let worst = { deg: 0 }
    for (const p of samples) {
      for (let ox = -30; ox <= 30; ox += 0.25) {
        const x = p.x + ox
        const z = p.z
        const h = hm.sampleHeight(x, z)
        for (const [dx, dz] of [
          [STEP, 0],
          [0, STEP],
          [STEP * 0.707, STEP * 0.707],
        ]) {
          const rise = Math.abs(hm.sampleHeight(x + dx, z + dz) - h)
          const deg = (Math.atan2(rise, STEP) * 180) / Math.PI
          if (deg > worst.deg) worst = { deg, x, z }
        }
      }
    }
    assert.ok(worst.deg <= 40, `미세 경사 ${worst.deg.toFixed(2)}도 @ ${JSON.stringify(worst)}`)
    assert.ok(worst.deg <= 25, `미세 경사가 25도를 넘는다: ${worst.deg.toFixed(2)}도`)
  })
})

describe('M1-02·03 절차적 지형 — 길 평탄', () => {
  test('길 중심선 반경 6m 안은 가로로 평탄하다', () => {
    const samples = mask.sampleCenterline(centerline, 60)
    let maxCross = 0
    for (const p of samples) {
      const h0 = hm.sampleHeight(p.x, p.z)
      // 중심선에 수직인 방향으로 ±6m 를 훑는다
      for (const r of [-6, -4, -2, 2, 4, 6]) {
        // 수직 방향을 모르므로 x·z 양쪽으로 재고 최대를 본다(보수적)
        for (const [dx, dz] of [
          [r, 0],
          [0, r],
        ]) {
          const q = { x: p.x + dx, z: p.z + dz }
          if (Math.abs(q.x) > HALF || Math.abs(q.z) > HALF) continue
          // 여전히 6m 안인 지점만 평탄 판정 대상이다
          if (mask.distanceToCenterline(q.x, q.z, centerline) > 6) continue
          maxCross = Math.max(maxCross, Math.abs(hm.sampleHeight(q.x, q.z) - h0))
        }
      }
    }
    // 중심선 높이로 맞추므로 가로 편차는 세로 진행분(길 자체 기울기)만 남는다
    assert.ok(maxCross <= 0.6, `길 반경 6m 안 높이 편차 ${maxCross.toFixed(3)}m`)
  })

  test('길을 따라가는 세로 경사도 완만하다', () => {
    const samples = mask.sampleCenterline(centerline, 300)
    let maxDeg = 0
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]
      const b = samples[i]
      const run = Math.hypot(b.x - a.x, b.z - a.z)
      if (run < 1e-6) continue
      const rise = Math.abs(hm.sampleHeight(b.x, b.z) - hm.sampleHeight(a.x, a.z))
      maxDeg = Math.max(maxDeg, (Math.atan2(rise, run) * 180) / Math.PI)
    }
    assert.ok(maxDeg <= 25, `길 세로 경사 ${maxDeg.toFixed(3)}°`)
  })
})

describe('M1-02·03 절차적 지형 — 마을 평지', () => {
  test('마을 중심 반경 22m 안이 평지다', () => {
    const c = mainPath.landmarks.villageCenter
    const h0 = hm.sampleHeight(c.x, c.z)
    let maxDelta = 0
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      for (let r = 0; r <= hm.VILLAGE_FLAT_RADIUS; r += 2) {
        const x = c.x + Math.cos(a) * r
        const z = c.z + Math.sin(a) * r
        maxDelta = Math.max(maxDelta, Math.abs(hm.sampleHeight(x, z) - h0))
      }
    }
    assert.ok(maxDelta <= 0.5, `마을 반경 ${hm.VILLAGE_FLAT_RADIUS}m 안 편차 ${maxDelta.toFixed(3)}m`)
  })

  test('스폰·전망 3곳이 전부 경계 안이고 높이가 유한하다', () => {
    const vistas = readJson('src/data/vistas.json')
    const points = [mainPath.landmarks.spawn, mainPath.landmarks.heroTree, ...vistas.markers.map((m) => m.position)]
    for (const p of points) {
      const h = hm.sampleGround(p.x, p.z)
      assert.notEqual(h, null, `경계 밖: ${JSON.stringify(p)}`)
      assert.equal(Number.isFinite(h), true)
    }
  })
})

describe('M1-02·03 절차적 지형 — 계약', () => {
  test('sampleGround 는 경계 밖에서 null 을 준다(GroundSampler 계약)', () => {
    assert.equal(hm.sampleGround(HALF + 0.5, 0), null)
    assert.equal(hm.sampleGround(0, -HALF - 0.5), null)
    assert.equal(typeof hm.sampleGround(0, 0), 'number')
  })

  test('결정론 — 같은 좌표는 항상 같은 높이', () => {
    const pts = [
      [0, 0],
      [37.5, -96.25],
      [-120, 118],
      [12.3456, -78.9012],
    ]
    for (const [x, z] of pts) {
      const a = hm.sampleHeight(x, z)
      const b = hm.sampleHeight(x, z)
      const c = hm.sampleHeight(x, z)
      assert.equal(a, b)
      assert.equal(b, c)
    }
  })

  test('동굴·오버행 0 — 높이 함수라 좌표당 높이가 하나뿐이다', () => {
    // 구조적 보장. 반환 타입이 스칼라인 것으로 검증한다.
    assert.equal(typeof hm.sampleHeight(10, -10), 'number')
  })
})

console.log(
  `\n[terrain] 기복 ${stats.relief.toFixed(3)}m (min ${stats.min.toFixed(3)} / max ${stats.max.toFixed(3)}) · ` +
    `최대 경사 ${stats.maxSlopeDeg.toFixed(3)}° · 샘플 ${stats.samples}`,
)
