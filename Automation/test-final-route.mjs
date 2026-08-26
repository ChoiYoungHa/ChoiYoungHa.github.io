import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M4-01 `?route=final` 러너의 순수 로직(finalRoute.ts) 결정론 테스트.
 * 실행: node --test Automation/test-final-route.mjs   (GPU·브라우저 없음)
 *
 * 검사: ① final-route.json 이 로드맵 M4-01 완료 조건(60~90초·waypoint≥8·hash)을 만족
 *       ② routeHash 재계산(SubtleCrypto)과 node:crypto 독립 계산이 파일값과 모두 일치
 *       ③ waypoint 순서·duration·입력 보간이 결정론적
 *       ④ bench 경로(benchRoute.json·validateBenchRoute 규칙)는 final 과 무관하게 그대로
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const F = await load('src/systems/bench/finalRoute.ts')
const route = readJson('src/systems/bench/final-route.json')
const bench = readJson('src/systems/bench/benchRoute.json')

// R100-A: 밑동 정지점 3.02m → 9.5m(발자국 반경 8 + 1.5), hero-approach 43 → 40.2s(이동 거리 −9m), fit-final-route 재적합
const EXPECTED = { hash: 'a9f1339c4187', duration: 75, waypoints: 11, id: 'm4-final-route-v1' }

describe('M4-01 final-route.json 구조', () => {
  test('validateFinalRoute 통과', () => {
    assert.doesNotThrow(() => F.validateFinalRoute(route))
  })
  test('완료 조건 수치', () => {
    assert.equal(route.id, EXPECTED.id)
    assert.equal(route.durationSeconds, EXPECTED.duration)
    assert.equal(route.waypoints.length, EXPECTED.waypoints)
    assert.ok(route.durationSeconds >= 60 && route.durationSeconds <= 90)
    assert.ok(route.waypoints.length >= 8)
  })
  test('waypoint 시각 단조 증가, 0 → durationSeconds', () => {
    const times = route.waypoints.map((w) => w.timeSeconds)
    assert.equal(times[0], 0)
    assert.equal(times.at(-1), route.durationSeconds)
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1], `t[${i}]`)
    assert.deepEqual(times, [0, 5, 10, 17, 24, 30, 37, 40.2, 50, 65, 75])
  })
  test('waypoint id 순서 고정', () => {
    assert.deepEqual(
      route.waypoints.map((w) => w.id),
      ['spawn', 'village-gap', 'village-north', 'meadow-entry', 'gentle-rise', 'mid-vista', 'tree-approach', 'hero-approach', 'hero-look', 'turn-back', 'village-lookback'],
    )
  })
})

describe('routeHash 재계산 일치', () => {
  test('SubtleCrypto(런타임 경로) == 파일값', async () => {
    assert.equal(await F.computeFinalRouteHash(route), EXPECTED.hash)
    assert.equal(route.routeHash, EXPECTED.hash)
    assert.equal(await F.verifyFinalRouteHash(route), EXPECTED.hash)
  })
  test('node:crypto 독립 계산 == 파일값 (routeHashMethod 문구 그대로)', () => {
    const { routeHash, routeHashMethod, ...rest } = route
    void routeHashMethod
    const hex = createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex').slice(0, 12)
    assert.equal(hex, routeHash)
    assert.equal(F.canonicalFinalRouteJson(route), JSON.stringify(rest))
  })
  test('waypoint 하나만 바뀌어도 hash 불일치 → verify 가 throw', async () => {
    const tampered = structuredClone(route)
    tampered.waypoints[5].pose.yaw += 0.001
    await assert.rejects(() => F.verifyFinalRouteHash(tampered), /hash mismatch/)
  })
  test('hash 형식 위반은 validate 가 거부', () => {
    assert.throws(() => F.validateFinalRoute({ ...route, routeHash: 'XYZ' }), /routeHash/)
    assert.throws(() => F.validateFinalRoute({ ...route, durationSeconds: 120 }), /durationSeconds/)
    assert.throws(() => F.validateFinalRoute({ ...route, waypoints: route.waypoints.slice(0, 7) }), /waypoints/)
  })
})

describe('finalInputAt 결정론', () => {
  test('waypoint 정각에서는 그 waypoint 의 pose.yaw·input 을 그대로', () => {
    for (const w of route.waypoints.slice(0, -1)) {
      const s = F.finalInputAt(route, w.timeSeconds)
      assert.equal(s.forward, w.input.forward, w.id)
      assert.equal(s.run, w.input.run, w.id)
      assert.equal(s.strafe, 0)
      assert.ok(Math.abs(s.yaw - w.pose.yaw) < 1e-12, `${w.id} yaw`)
    }
  })
  test('구간 중간은 yaw 선형 보간, 40.2초 이후 forward 0(정지 후 회전)', () => {
    const mid = F.finalInputAt(route, 2.5) // spawn → village-gap 중간(yaw 는 재적합마다 바뀌므로 파일값으로 계산)
    const [w0, w1] = route.waypoints
    assert.ok(Math.abs(mid.yaw - (w0.pose.yaw + w1.pose.yaw) / 2) < 1e-9)
    assert.equal(mid.forward, 1)
    for (const t of [40.2, 47, 55, 70, 74.9]) assert.equal(F.finalInputAt(route, t).forward, 0, `t=${t}`)
    for (const t of [0, 10, 30, 40.1]) assert.equal(F.finalInputAt(route, t).forward, 1, `t=${t}`)
  })
  test('범위 밖은 clamp — 음수는 t=0, duration 초과는 마지막 waypoint', () => {
    assert.deepEqual(F.finalInputAt(route, -3), F.finalInputAt(route, 0))
    const end = F.finalInputAt(route, 999)
    assert.ok(Math.abs(end.yaw - route.waypoints.at(-1).pose.yaw) < 1e-12)
    assert.equal(end.forward, 0)
  })
  test('같은 입력 → 같은 출력 (dt 무관, 3회 재현)', () => {
    const samples = [0, 1 / 144, 7.3, 24, 44.5, 66.6, 75]
    const a = samples.map((t) => F.finalInputAt(route, t))
    const b = samples.map((t) => F.finalInputAt(route, t))
    const c = samples.map((t) => F.finalInputAt(route, t))
    assert.deepEqual(a, b)
    assert.deepEqual(b, c)
  })
  test('yaw 보간은 ±π 경계를 최단 각으로 지난다', () => {
    assert.ok(Math.abs(F.lerpAngle(3.0, -3.0, 0.5) - Math.PI) < 1e-9)
    assert.ok(Math.abs(F.lerpAngle(-3.0, 3.0, 0.5) + Math.PI) < 1e-9)
  })
})

describe('bench 경로 불변 (M3-GATE 재현성)', () => {
  test('benchRoute.json 은 60초·5키프레임·routeHash 그대로', () => {
    assert.equal(bench.routeHash, 'm0b-bench-v3-mainpath')
    assert.deepEqual(bench.keyframes.map((k) => k.time), [0, 15, 30, 45, 60])
  })
  test('final 규칙은 bench 문서를 거부한다(두 러너가 섞이지 않음)', () => {
    assert.throws(() => F.validateFinalRoute(bench))
  })
})
