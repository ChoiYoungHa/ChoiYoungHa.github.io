import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const { createRaycastController } = await load('src/player/controllers/raycast.ts')
const { RAYCAST_DEFAULTS } = await load('src/player/controllers/types.ts')

const DT = 1 / 60
const FLAT = () => 0
const input = (overrides = {}) => ({ forward: 0, strafe: 0, run: false, yaw: 0, ...overrides })

function jumpArc(ground = FLAT, perFrame = () => ({})) {
  const controller = createRaycastController(ground, { x: 0, y: 0, z: 0 }, { jumpEnabled: true })
  let result = controller.step(input({ jump: true }), DT)
  let elapsed = DT
  let apex = result.position.y
  const samples = [result]
  for (let frame = 1; frame < 180 && !result.grounded; frame += 1) {
    result = controller.step(input(perFrame(frame)), DT)
    elapsed += DT
    apex = Math.max(apex, result.position.y)
    samples.push(result)
  }
  return { apex, elapsed, result, samples }
}

test('점프 정점은 0.75±0.05m이고 체공은 0.58±0.05s다', () => {
  const arc = jumpArc()
  const height = arc.apex - RAYCAST_DEFAULTS.eyeOffset
  assert.ok(Math.abs(height - 0.75) <= 0.05, `height=${height}`)
  assert.ok(Math.abs(arc.elapsed - 0.58) <= 0.05, `airtime=${arc.elapsed}`)
  assert.equal(arc.result.grounded, true)
  assert.equal(arc.result.position.y, RAYCAST_DEFAULTS.eyeOffset)
})

test('공중 연타는 수직 속도를 재설정하지 않아 재점프가 0회다', () => {
  const baseline = jumpArc()
  const repeated = jumpArc(FLAT, (frame) => ({ jump: frame < 20 }))
  assert.ok(baseline.apex - RAYCAST_DEFAULTS.eyeOffset > 0.7)
  assert.equal(repeated.elapsed, baseline.elapsed)
  assert.equal(repeated.apex, baseline.apex)
})

test('40° 경사에서 점프 착지까지 지면 관통이 0이다', () => {
  const slope = (x, z) => Math.tan(40 * Math.PI / 180) * Math.max(0, -z)
  const arc = jumpArc(slope, () => ({ forward: 1 }))
  assert.ok(arc.result.position.z < -0.1, `z=${arc.result.position.z}`)
  for (const sample of arc.samples) {
    const groundY = slope(sample.position.x, sample.position.z) + RAYCAST_DEFAULTS.eyeOffset
    assert.ok(sample.position.y >= groundY - 1e-9, `y=${sample.position.y} ground=${groundY}`)
  }
  assert.equal(arc.result.grounded, true)
})

test('점프 게이트 OFF는 jump 입력이 있어도 기존 궤적과 수치 동일하다', () => {
  const baseline = createRaycastController(FLAT, { x: 0, y: 0, z: 0 })
  const gatedOff = createRaycastController(FLAT, { x: 0, y: 0, z: 0 }, { jumpEnabled: false })
  for (let frame = 0; frame < 180; frame += 1) {
    const regular = baseline.step(input({ forward: 1, run: frame > 60 }), DT)
    const attempted = gatedOff.step(input({ forward: 1, run: frame > 60, jump: true }), DT)
    assert.deepEqual(attempted, regular)
  }
})
