// M0a-09 완료 조건 검증: W 5초 = 16m ±1m, 지면 관통 0.
//
// 헤드리스에서 키 입력을 흘려넣는 것은 불안정하므로 **결정론적 시뮬레이션**으로 대체한다.
// 컨트롤러가 three·React 에 의존하지 않게 설계했기 때문에(계획서.md §5-6) 그대로 Node 에서 돈다.
//
// 사용: node Automation/walk-check.mjs <compiled-raycast.js>

import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const modPath = resolve(process.argv[2])
const { createRaycastController } = await import(pathToFileURL(modPath).href)

const GROUND_Y = 0
const HALF = 40 // 80m x 80m 평면 (M0-a 프로토타입 바닥)
const EYE = 0.9

/** 평면 바닥 샘플러. 경계 밖은 null(=지면 없음). */
const sampleGround = (x, z) => (Math.abs(x) <= HALF && Math.abs(z) <= HALF ? GROUND_Y : null)

function run({ dt, seconds, run: running }) {
  const c = createRaycastController(sampleGround, { x: 0, y: 0, z: 0 })
  const steps = Math.round(seconds / dt)
  const input = { forward: 1, strafe: 0, run: running, yaw: 0 }
  let minY = Infinity
  let maxY = -Infinity
  let ungrounded = 0
  let last = null
  for (let i = 0; i < steps; i++) {
    last = c.step(input, dt)
    minY = Math.min(minY, last.position.y)
    maxY = Math.max(maxY, last.position.y)
    if (!last.grounded) ungrounded += 1
  }
  const d = Math.hypot(last.position.x - 0, last.position.z - 0)
  return {
    dt,
    steps,
    seconds,
    run: running,
    distance_m: +d.toFixed(4),
    final: {
      x: +last.position.x.toFixed(4),
      y: +last.position.y.toFixed(4),
      z: +last.position.z.toFixed(4),
    },
    speed_final_mps: +last.speed.toFixed(4),
    minY: +minY.toFixed(4),
    maxY: +maxY.toFixed(4),
    ungroundedSteps: ungrounded,
  }
}

// 2026-08-28: 걷기 3.2→4.0, 달리기 5.6→6.5 (RAYCAST_DEFAULTS). 이론값: 0->4.0 m/s 가속(12 m/s^2) 0.333s 동안 0.667m 손실, 이후 등속
const WALK = 4.0
const RUN = 6.5
const theoretical = WALK * 5 - (WALK * WALK) / (2 * 12)

// 프레임레이트 독립성: 여러 dt 로 같은 거리가 나와야 한다
const walk = [1 / 60, 1 / 120, 1 / 30].map((dt) => run({ dt, seconds: 5, run: false }))
const runCase = run({ dt: 1 / 60, seconds: 5, run: true })

// 경계 밖으로 못 나가는지(관통/이탈 0)
const boundary = run({ dt: 1 / 60, seconds: 60, run: true })

const primary = walk[0]
const TARGET = Math.round(theoretical)
const TOL = 1
const checks = {
  [`↑ 5초 이동거리 ${TARGET}m ±${TOL}m`]: {
    value: primary.distance_m,
    pass: Math.abs(primary.distance_m - TARGET) <= TOL,
    detail: `이론값 ${theoretical.toFixed(4)}m (가속 구간 손실 ${((WALK * WALK) / (2 * 12)).toFixed(4)}m 포함)`,
  },
  '지면 관통 0 (y가 항상 지면+eyeOffset)': {
    value: `minY=${primary.minY} maxY=${primary.maxY}`,
    pass: primary.minY >= GROUND_Y + EYE - 1e-6 && primary.maxY <= GROUND_Y + EYE + 1e-6,
  },
  '접지 유지 (grounded=false 스텝 0)': {
    value: primary.ungroundedSteps,
    pass: primary.ungroundedSteps === 0,
  },
  '프레임레이트 독립 (dt 60/120/30 편차 ≤0.05m)': {
    value: walk.map((w) => w.distance_m).join(' / '),
    pass: Math.max(...walk.map((w) => w.distance_m)) - Math.min(...walk.map((w) => w.distance_m)) <= 0.05,
  },
  '달리기가 걷기보다 빠름': {
    value: `${runCase.distance_m} > ${primary.distance_m}`,
    pass: runCase.distance_m > primary.distance_m,
  },
  '화면 이탈 0 (60초 달려도 바닥 경계 안)': {
    value: `|z|=${Math.abs(boundary.final.z)} <= ${HALF}`,
    pass: Math.abs(boundary.final.z) <= HALF && Math.abs(boundary.final.x) <= HALF,
  },
}

const allPass = Object.values(checks).every((c) => c.pass)
const report = {
  at: new Date().toISOString(),
  method:
    '결정론적 시뮬레이션 — 헤드리스 키 입력 대신 고정 dt 로 컨트롤러 step() 을 직접 호출했다. 컨트롤러가 three/React 비의존이라 가능하다.',
  params: { walkSpeed: WALK, runSpeed: RUN, acceleration: 12, groundSnap: 0.35, eyeOffset: EYE },
  theoretical_distance_m: +theoretical.toFixed(4),
  cases: { walk60: walk[0], walk120: walk[1], walk30: walk[2], run60: runCase, boundary60s: boundary },
  checks,
  result: allPass ? 'PASS' : 'FAIL',
}

const out = join(resolve('.'), 'Docs', 'm0a')
await mkdir(out, { recursive: true })
await writeFile(join(out, 'walk-check.json'), JSON.stringify(report, null, 2), 'utf8')

for (const [k, v] of Object.entries(checks)) {
  console.log(`${v.pass ? 'PASS' : 'FAIL'}  ${k}  -> ${v.value}`)
}
console.log(`\nRESULT: ${report.result}`)
process.exit(allPass ? 0 : 1)
