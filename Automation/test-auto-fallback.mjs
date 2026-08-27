import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * R117-A 자동 후퇴(base → low) 순수 로직 테스트.
 * 실행: node --test Automation/test-auto-fallback.mjs — 브라우저·GPU 없이 돈다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const af = await load('src/systems/perf/autoFallback.ts')

/** 창을 지나도록 dt 를 먹인다. 반환은 첫 판정(없으면 null). */
function run(fallback, fps, { spikeMs = null, warmupFps = 5 } = {}) {
  const warmupDt = 1 / warmupFps
  let decision = null
  for (let t = 0; t < af.WARMUP_SECONDS; t += warmupDt) {
    decision = fallback.step(warmupDt) ?? decision
  }
  const dt = 1 / fps
  let spiked = spikeMs === null
  for (let t = 0; t < af.WINDOW_SECONDS + dt; t += dt) {
    const step = spiked ? dt : spikeMs / 1000
    spiked = true
    decision = fallback.step(step) ?? decision
  }
  return decision
}

test('워밍업 구간에서는 판정하지 않는다', () => {
  const fallback = af.createAutoFallback()
  for (let t = 0; t < af.WARMUP_SECONDS; t += 1 / 60) {
    assert.equal(fallback.step(1 / 60), null)
  }
  assert.equal(fallback.decided, false)
})

test('워밍업의 느린 프레임은 표본에서 제외된다(60fps 본구간이면 후퇴 없음)', () => {
  const fallback = af.createAutoFallback()
  const decision = run(fallback, 60, { warmupFps: 2 }) // 워밍업은 500ms 프레임
  assert.ok(decision !== null)
  assert.equal(decision.fallback, false)
  assert.ok(decision.averageFps > 55, `avg=${decision.averageFps}`)
  assert.ok(decision.onePercentLowFps > 55, `low1=${decision.onePercentLowFps}`)
})

test('평균 fps 가 관문(30) 미만이면 후퇴한다', () => {
  const decision = run(af.createAutoFallback(), 20)
  assert.equal(decision.fallback, true)
  assert.ok(decision.averageFps < af.MIN_AVERAGE_FPS)
})

test('평균은 통과해도 하위 1%(20) 미달이면 후퇴한다', () => {
  // 60fps 구간에 100ms 스파이크 1회 → 하위 1% = 10fps
  const decision = run(af.createAutoFallback(), 60, { spikeMs: 100 })
  assert.equal(decision.fallback, true)
  assert.ok(decision.averageFps >= af.MIN_AVERAGE_FPS, `avg=${decision.averageFps}`)
  assert.ok(decision.onePercentLowFps < af.MIN_ONE_PERCENT_LOW_FPS, `low1=${decision.onePercentLowFps}`)
})

test('판정은 1회뿐이다 — 이후 step 은 항상 null', () => {
  const fallback = af.createAutoFallback()
  const decision = run(fallback, 20)
  assert.ok(decision !== null)
  assert.equal(fallback.decided, true)
  for (let i = 0; i < 100; i += 1) assert.equal(fallback.step(1 / 60), null)
})

test('창이 끝나기 전에는 판정하지 않는다', () => {
  const fallback = af.createAutoFallback()
  let steps = 0
  for (let t = 0; t < af.WARMUP_SECONDS + af.WINDOW_SECONDS - 0.5; t += 1 / 60) {
    if (fallback.step(1 / 60) !== null) steps += 1
  }
  assert.equal(steps, 0)
  assert.equal(fallback.decided, false)
})

test('dt 가 0 이하거나 NaN 이면 무시한다', () => {
  const fallback = af.createAutoFallback()
  assert.equal(fallback.step(0), null)
  assert.equal(fallback.step(-1), null)
  assert.equal(fallback.step(Number.NaN), null)
  assert.equal(fallback.decided, false)
})

test('표본이 없으면 후퇴하지 않는다', () => {
  const summary = af.summarizeFrames([])
  assert.equal(summary.samples, 0)
  assert.equal(af.shouldFallback(summary), false)
})

test('summarizeFrames 는 perf.ts 와 같은 정의를 쓴다(가장 느린 1% 평균의 역수)', () => {
  const durations = [...Array(99).fill(10), 200] // 100 프레임 중 1개가 200ms
  const summary = af.summarizeFrames(durations)
  assert.equal(summary.samples, 100)
  assert.ok(Math.abs(summary.onePercentLowFps - 5) < 1e-9, `low1=${summary.onePercentLowFps}`)
  assert.ok(Math.abs(summary.averageFps - (100 * 1000) / 1190) < 1e-9, `avg=${summary.averageFps}`)
})

test('경계값: 정확히 관문에 걸치면 후퇴하지 않는다', () => {
  assert.equal(af.shouldFallback({ samples: 100, averageFps: 30, onePercentLowFps: 20 }), false)
  assert.equal(af.shouldFallback({ samples: 100, averageFps: 29.9, onePercentLowFps: 20 }), true)
  assert.equal(af.shouldFallback({ samples: 100, averageFps: 30, onePercentLowFps: 19.9 }), true)
})

test('?q 를 명시하면 자동 후퇴하지 않는다(사용자 선택 우선)', () => {
  assert.equal(af.isAutoFallbackEligible('?q=base', 'manual'), false)
  assert.equal(af.isAutoFallbackEligible('?q=low', 'manual'), false)
  assert.equal(af.isAutoFallbackEligible('', 'manual'), true)
  assert.equal(af.isAutoFallbackEligible('?game=1', undefined), true)
})

test('bench·final 측정 중에는 자동 후퇴하지 않는다(정본 불변)', () => {
  assert.equal(af.isAutoFallbackEligible('?route=bench', 'bench'), false)
  assert.equal(af.isAutoFallbackEligible('?route=final', 'final'), false)
})
