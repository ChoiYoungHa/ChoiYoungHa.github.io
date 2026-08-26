import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M0b-10/11/12 계약 테스트 — 계획서.md §3-4 의 수치를 결정론적으로 검증한다.
 *
 * 실행: node --test Automation/test-raycast.mjs
 *
 * 왜 `src/` 가 아니라 여기인가:
 *   tsconfig.app.json 이 `types: ["vite/client"]` 라 `src/` 안에서는 `node:test` 타입이
 *   해석되지 않아 `tsc -b`(=`npm run build`)가 깨진다. 로드맵이 허용한 두 위치 중
 *   빌드에 영향이 없는 쪽을 골랐다. 새 패키지·설정 변경은 하지 않았다.
 *
 * 컨트롤러가 three·React 비의존이라 브라우저 없이 잰다(CLAUDE.md 코드 규칙).
 * Node 24 가 `.ts` 를 그대로 벗겨 실행한다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYER = resolve(HERE, '..', 'src', 'player')
const load = (rel) => import(pathToFileURL(join(PLAYER, rel)).href)

const { createRaycastController } = await load('controllers/raycast.ts')
const { RAYCAST_DEFAULTS } = await load('controllers/types.ts')
const { DEFAULT_BINDINGS } = await load('input.ts')

const FLAT = () => 0
const EYE = RAYCAST_DEFAULTS.eyeOffset

const input = (over = {}) => ({ forward: 0, strafe: 0, run: false, yaw: 0, ...over })

/** 고정 dt 로 n초 굴린 뒤 마지막 결과를 돌려준다. */
function simulate(ground, inp, seconds, dt) {
  const c = createRaycastController(ground, { x: 0, y: 0, z: 0 })
  const steps = Math.round(seconds / dt)
  let last = c.step(inp, dt)
  for (let i = 1; i < steps; i++) last = c.step(inp, dt)
  return last
}

describe('M0b-11 raycast 계약 — 계획서 §3-4 6개 수치', () => {
  // ── 1. 보행 3.2 m/s ────────────────────────────────────────────────
  test('1. 보행 정상속도 = 3.2 m/s', () => {
    assert.equal(RAYCAST_DEFAULTS.walkSpeed, 3.2)
    // 3초면 가속이 끝나고 등속에 도달한다(3.2 / 12 = 0.267초)
    const r = simulate(FLAT, input({ forward: 1 }), 3, 1 / 60)
    assert.ok(Math.abs(r.speed - 3.2) < 1e-9, `speed=${r.speed}`)

    // 등속 구간 1초 이동거리로 교차검증
    const c = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    const i = input({ forward: 1 })
    for (let n = 0; n < 60; n++) c.step(i, 1 / 60) // 가속 소진
    const z0 = c.position.z
    for (let n = 0; n < 60; n++) c.step(i, 1 / 60) // 등속 1초
    assert.ok(Math.abs(Math.abs(c.position.z - z0) - 3.2) < 1e-9)
  })

  // ── 2. 달리기 5.6 m/s ──────────────────────────────────────────────
  test('2. 달리기 정상속도 = 5.6 m/s', () => {
    assert.equal(RAYCAST_DEFAULTS.runSpeed, 5.6)
    const r = simulate(FLAT, input({ forward: 1, run: true }), 3, 1 / 60)
    assert.ok(Math.abs(r.speed - 5.6) < 1e-9, `speed=${r.speed}`)
    const w = simulate(FLAT, input({ forward: 1 }), 3, 1 / 60)
    assert.ok(r.speed > w.speed)
  })

  // ── 3. 가속 12 m/s² ────────────────────────────────────────────────
  test('3. 가속도 = 12 m/s² (1스텝 증분과 도달시간)', () => {
    assert.equal(RAYCAST_DEFAULTS.acceleration, 12)
    const dt = 1 / 60
    const c = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    const one = c.step(input({ forward: 1 }), dt)
    // 정지에서 1스텝: 속도 = 12 * dt = 0.2
    assert.ok(Math.abs(one.speed - 12 * dt) < 1e-12, `speed=${one.speed}`)

    // 3.2 m/s 도달까지 3.2 / (12*dt) = 16스텝
    const c2 = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    const i = input({ forward: 1 })
    let stepsToTop = 0
    for (let n = 0; n < 120; n++) {
      const r = c2.step(i, dt)
      stepsToTop = n + 1
      if (Math.abs(r.speed - 3.2) < 1e-9) break
    }
    assert.equal(stepsToTop, Math.ceil(3.2 / (12 * dt)))
  })

  // ── 4. 회전 보간 0.15 ──────────────────────────────────────────────
  test('4. 회전 보간 계수 = 0.15 (1스텝 heading)', () => {
    assert.equal(RAYCAST_DEFAULTS.turnLerp, 0.15)
    const c = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    // 우측 스트레이프만 → 목표 heading = +PI/2, 시작 heading = 0
    const r = c.step(input({ strafe: 1 }), 1 / 60)
    const expected = (Math.PI / 2) * 0.15
    assert.ok(Math.abs(r.heading - expected) < 1e-12, `heading=${r.heading} expected=${expected}`)
  })

  // ── 5. 경사 한계 40° ───────────────────────────────────────────────
  test('5. 경사 한계 = 40° (39°는 오르고 41°는 막힌다)', () => {
    assert.equal(RAYCAST_DEFAULTS.maxSlopeDeg, 40)
    const ramp = (deg) => (_x, z) => Math.tan((deg * Math.PI) / 180) * Math.max(0, -z)

    const up = simulate(ramp(39), input({ forward: 1 }), 1, 1 / 60)
    assert.ok(up.position.z < -0.5, `39°에서 전진하지 못했다: z=${up.position.z}`)

    const blocked = simulate(ramp(41), input({ forward: 1 }), 1, 1 / 60)
    assert.equal(blocked.position.z, 0, `41°에서 전진했다: z=${blocked.position.z}`)
  })

  // ── 6. 접지 스냅 0.35 m ────────────────────────────────────────────
  test('6. 접지 스냅 = 0.35 m (1스텝 수직 보정 상한)', () => {
    assert.equal(RAYCAST_DEFAULTS.groundSnap, 0.35)
    // dt=1.0 이면 한 스텝에 3.2m 전진 → 30° 경사에서 필요한 수직 보정 1.847m.
    // 상한이 걸려 정확히 0.35m 만 올라가야 한다.
    const ramp30 = (_x, z) => Math.tan(Math.PI / 6) * Math.max(0, -z)
    const c = createRaycastController(ramp30, { x: 0, y: 0, z: 0 })
    const y0 = c.position.y
    assert.equal(y0, EYE) // 시작은 평지(z=0)라 지면+eyeOffset
    const r = c.step(input({ forward: 1 }), 1)
    assert.ok(Math.abs(r.position.y - (y0 + 0.35)) < 1e-12, `y=${r.position.y}`)

    // 정상 프레임(dt=1/60)에서는 상한에 걸리지 않는다 — 안전망이지 상시 동작이 아니다
    const c2 = createRaycastController(ramp30, { x: 0, y: 0, z: 0 })
    let prevY = c2.position.y
    for (let n = 0; n < 60; n++) {
      const s = c2.step(input({ forward: 1 }), 1 / 60)
      assert.ok(s.position.y - prevY < 0.35, '정상 dt 에서 스냅 상한에 걸렸다')
      prevY = s.position.y
    }
  })
})

describe('M0b-11 부가 — 접지·경계 불변식', () => {
  test('평지에서 y 는 항상 지면+eyeOffset, grounded 유지', () => {
    const c = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    for (let n = 0; n < 300; n++) {
      const r = c.step(input({ forward: 1, strafe: 1, run: true }), 1 / 60)
      assert.equal(r.position.y, EYE)
      assert.equal(r.grounded, true)
    }
  })

  test('지면이 없는 곳으로는 나가지 않는다', () => {
    const island = (x, z) => (Math.abs(x) <= 5 && Math.abs(z) <= 5 ? 0 : null)
    const r = simulate(island, input({ forward: 1, run: true }), 10, 1 / 60)
    assert.ok(Math.abs(r.position.z) <= 5, `경계를 넘었다: z=${r.position.z}`)
  })

  test('프레임레이트 독립 — dt 30/60/120 의 5초 이동거리 편차 ≤ 0.05m', () => {
    const d = [1 / 30, 1 / 60, 1 / 120].map((dt) => {
      const r = simulate(FLAT, input({ forward: 1 }), 5, dt)
      return Math.hypot(r.position.x, r.position.z)
    })
    assert.ok(Math.max(...d) - Math.min(...d) <= 0.05, `거리들=${d.join(', ')}`)
  })

  test('step() 반환 형태가 M0b-14 벤치 러너 계약과 일치한다', () => {
    const c = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
    const r = c.step(input({ forward: 1 }), 1 / 60)
    assert.deepEqual(Object.keys(r).sort(), ['grounded', 'heading', 'position', 'speed'])
    assert.deepEqual(Object.keys(r.position).sort(), ['x', 'y', 'z'])
    assert.equal(typeof r.grounded, 'boolean')
    assert.equal(typeof r.speed, 'number')
    assert.equal(typeof r.heading, 'number')
  })
})

describe('M0b-10 입력 계약 — action 8개, jump·Interact 0', () => {
  test('DEFAULT_BINDINGS 와 Action 유니온이 8개이고 jump·interact 가 없다', () => {
    // lookX/lookY 는 포인터 delta 라 키 바인딩이 없다 → 바인딩은 6개
    assert.deepEqual(Object.keys(DEFAULT_BINDINGS).sort(), [
      'moveBack',
      'moveForward',
      'moveLeft',
      'moveRight',
      'run',
      'toggleQuality',
    ])
    const src = readFileSync(join(PLAYER, 'input.ts'), 'utf8')
    const union = src.match(/export type Action =([\s\S]*?)\n\n/)?.[1] ?? ''
    const actions = [...union.matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1])
    assert.equal(actions.length, 8, `Action 개수=${actions.length}`)
    assert.deepEqual(actions.sort(), [
      'lookX',
      'lookY',
      'moveBack',
      'moveForward',
      'moveLeft',
      'moveRight',
      'run',
      'toggleQuality',
    ])
    // Action 유니온·키 바인딩 어디에도 jump·interact 가 없어야 한다
    assert.equal(actions.filter((a) => /jump|interact/i.test(a)).length, 0)
    assert.equal(
      Object.keys(DEFAULT_BINDINGS).filter((k) => /jump|interact/i.test(k)).length,
      0,
    )
    // 스페이스바가 어떤 동작에도 묶여 있지 않아야 한다(점프 금지의 실질 검증)
    const allCodes = Object.values(DEFAULT_BINDINGS).flat()
    assert.equal(allCodes.includes('Space'), false, 'Space 가 바인딩돼 있다')
  })
})

describe('M0b-12 카메라 계약 — 계획서 §3-4 5개 수치', () => {
  /**
   * FollowCamera.tsx 는 JSX 라 node --test 로 import 할 수 없다(변환기 필요·새 패키지 금지).
   * 그래서 CAMERA 리터럴을 소스에서 직접 읽어 대조한다.
   * 값을 바꾸면 이 테스트가 깨진다 — 그게 계약 테스트의 목적이다.
   */
  test('FOV55 · 거리6 · 높이2.2 · pitch-12 · near0.1/far400', () => {
    const src = readFileSync(join(PLAYER, 'FollowCamera.tsx'), 'utf8')
    const block = src.match(/export const CAMERA = \{([\s\S]*?)\} as const/)?.[1]
    assert.ok(block, 'CAMERA 리터럴을 찾지 못했다')
    const num = (key) => {
      const m = block.match(new RegExp(`\\b${key}\\s*:\\s*(-?[0-9.]+)`))
      assert.ok(m, `${key} 를 찾지 못했다`)
      return Number(m[1])
    }
    assert.equal(num('fov'), 55)
    assert.equal(num('distance'), 6.0)
    assert.equal(num('height'), 2.2)
    assert.equal(num('pitchDeg'), -12)
    assert.equal(num('near'), 0.1)
    assert.equal(num('far'), 400)
  })
})
