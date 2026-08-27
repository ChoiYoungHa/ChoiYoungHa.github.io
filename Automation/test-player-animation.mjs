import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M5-11 (R117-A) 이동 블렌드 순수 함수 테스트. 실행: node --test Automation/test-player-animation.mjs
 * 브라우저·GPU 없이 돈다(계획서 §5-6).
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const anim = await load('src/player/animation.ts')
const types = await load('src/player/controllers/types.ts')

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps
const sum = (w) => w.idle + w.walk + w.run

test('클립 기준 속도가 컨트롤러 기본값과 일치한다', () => {
  assert.equal(anim.WALK_CLIP_SPEED, types.RAYCAST_DEFAULTS.walkSpeed)
  assert.equal(anim.RUN_CLIP_SPEED, types.RAYCAST_DEFAULTS.runSpeed)
})

test('0 m/s → idle 100%', () => {
  const w = anim.targetWeights(0)
  assert.deepEqual(w, { idle: 1, walk: 0, run: 0 })
  assert.ok(near(sum(w), 1))
})

test('정지 판정 임계 이하(0.05 m/s)는 idle 100%', () => {
  assert.deepEqual(anim.targetWeights(0.05), { idle: 1, walk: 0, run: 0 })
  assert.ok(anim.targetWeights(0.06).walk > 0)
})

test('1.6 m/s → idle 50% + walk 50%', () => {
  const w = anim.targetWeights(1.6)
  assert.ok(near(w.idle, 0.5))
  assert.ok(near(w.walk, 0.5))
  assert.equal(w.run, 0)
  assert.ok(near(sum(w), 1))
})

test('3.2 m/s → walk 100%', () => {
  const w = anim.targetWeights(3.2)
  assert.ok(near(w.walk, 1))
  assert.ok(near(w.idle, 0))
  assert.equal(w.run, 0)
})

test('4.4 m/s(walk~run 중간) → walk 50% + run 50%', () => {
  const w = anim.targetWeights(4.4)
  assert.ok(near(w.walk, 0.5))
  assert.ok(near(w.run, 0.5))
  assert.ok(near(sum(w), 1))
})

test('5.6 m/s 이상 → run 100%', () => {
  assert.deepEqual(anim.targetWeights(5.6), { idle: 0, walk: 0, run: 1 })
  assert.deepEqual(anim.targetWeights(9), { idle: 0, walk: 0, run: 1 })
})

test('모든 속도에서 가중치 합은 1이고 음수가 없다', () => {
  for (let speed = 0; speed <= 8; speed += 0.1) {
    const w = anim.targetWeights(speed)
    assert.ok(near(sum(w), 1, 1e-9), `sum at ${speed} = ${sum(w)}`)
    assert.ok(w.idle >= 0 && w.walk >= 0 && w.run >= 0)
  }
})

test('크로스페이드 0.2s 안에 목표에 95% 이상 수렴한다(dt=1/60)', () => {
  let w = { ...anim.IDLE_WEIGHTS }
  const dt = 1 / 60
  for (let t = 0; t < anim.CROSSFADE_SECONDS - 1e-9; t += dt) w = anim.blendWeights(w, 5.6, dt)
  assert.ok(w.run >= 0.95, `run=${w.run}`)
  assert.ok(near(sum(w), 1, 1e-9))
})

test('페이드는 프레임레이트에 독립이다(dt=1/30 vs 1/120, 0.2s 후 차 ≤0.02)', () => {
  const advance = (dt) => {
    let w = { ...anim.IDLE_WEIGHTS }
    for (let t = 0; t < anim.CROSSFADE_SECONDS - 1e-9; t += dt) w = anim.blendWeights(w, 3.2, dt)
    return w
  }
  assert.ok(Math.abs(advance(1 / 30).walk - advance(1 / 120).walk) <= 0.02)
})

test('dt 0 이하는 현재 가중치를 유지한다', () => {
  const w = { idle: 0.25, walk: 0.75, run: 0 }
  assert.deepEqual(anim.blendWeights(w, 5.6, 0), w)
  assert.deepEqual(anim.blendWeights(w, 5.6, -1), w)
})

test('블렌드는 정규화되어 합 1을 유지한다(무작위 시퀀스)', () => {
  let w = { ...anim.IDLE_WEIGHTS }
  const speeds = [0, 1.1, 3.2, 5.6, 4.0, 0.2, 0]
  for (const speed of speeds) {
    for (let i = 0; i < 20; i += 1) {
      w = anim.blendWeights(w, speed, 1 / 60)
      assert.ok(near(sum(w), 1, 1e-9))
    }
  }
  assert.ok(w.idle > 0.95, `정지 후 idle=${w.idle}`)
})

test('clipTimeScale: 기준 속도에서 1, 범위 밖은 클램프', () => {
  assert.ok(near(anim.clipTimeScale(3.2, anim.WALK_CLIP_SPEED), 1))
  assert.ok(near(anim.clipTimeScale(5.6, anim.RUN_CLIP_SPEED), 1))
  assert.equal(anim.clipTimeScale(0, anim.WALK_CLIP_SPEED), 1)
  assert.equal(anim.clipTimeScale(100, anim.WALK_CLIP_SPEED), anim.MAX_CLIP_TIME_SCALE)
  assert.equal(anim.clipTimeScale(0.2, anim.RUN_CLIP_SPEED), anim.MIN_CLIP_TIME_SCALE)
})

test('approachAngle: 720°/s 를 넘지 않고 최단 방향으로 돈다', () => {
  const dt = 1 / 60
  // 정확히 ±180°(π)는 회전 방향이 정의되지 않으므로(wrapAngle 규약상 -π) 90° 목표로 잰다.
  const stepped = anim.approachAngle(0, Math.PI / 2, dt)
  assert.ok(near(stepped, anim.MAX_TURN_RATE_RADIANS * dt, 1e-9))
  // 최단 방향: 목표가 -170° 면 시계 방향(음수)으로 돈다
  const shortest = anim.approachAngle(Math.PI * 0.95, -Math.PI * 0.95, dt)
  assert.ok(shortest > Math.PI * 0.95 - 1e-9 || shortest < -Math.PI * 0.9, `shortest=${shortest}`)
})

test('approachAngle: 남은 각이 한 스텝보다 작으면 목표에 정확히 도달한다', () => {
  const target = 0.001
  assert.ok(near(anim.approachAngle(0, target, 1 / 60), target, 1e-12))
})

test('approachAngle: 720°/s 로 180° 회전에 0.25s 가 걸린다', () => {
  let yaw = 0
  const dt = 1 / 120
  let elapsed = 0
  while (Math.abs(anim.wrapAngle(Math.PI - yaw)) > 1e-6 && elapsed < 2) {
    yaw = anim.approachAngle(yaw, Math.PI, dt)
    elapsed += dt
  }
  assert.ok(Math.abs(elapsed - 0.25) <= dt * 2, `elapsed=${elapsed}`)
})
