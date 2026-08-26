import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'

/**
 * M4-02·M4-11 UI 규칙(순수 함수) 계약 테스트.
 * 실행: node --test Automation/test-ui-logic.mjs   (브라우저·React 없음)
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const H = await load('src/systems/ui/controlsHintLogic.ts')
const L = await load('src/systems/ui/loadingLogic.ts')

test('M-05 GameOverlay는 useGame store를 한 번만 구독한다', async () => {
  const source = await readFile(join(ROOT, 'src/systems/ui/GameOverlay.tsx'), 'utf8')
  assert.equal([...source.matchAll(/useGame\(/g)].length, 1)
})

describe('M4-02 hintVisibleAt — 0~5.0초 표시, 5.1초 이후 숨김', () => {
  test('경계값', () => {
    assert.equal(H.HINT_VISIBLE_MS, 5000)
    assert.equal(H.hintVisibleAt(0), true)
    assert.equal(H.hintVisibleAt(2500), true)
    assert.equal(H.hintVisibleAt(4999), true)
    assert.equal(H.hintVisibleAt(5000), true) // 5.0초 정각까지 표시
    assert.equal(H.hintVisibleAt(5001), false)
    assert.equal(H.hintVisibleAt(5100), false) // 5.1초 이후 hidden
    assert.equal(H.hintVisibleAt(60_000), false)
  })
  test('음수·NaN 은 false, 사용자 지정 길이', () => {
    assert.equal(H.hintVisibleAt(-1), false)
    assert.equal(H.hintVisibleAt(Number.NaN), false)
    assert.equal(H.hintVisibleAt(1500, 1000), false)
    assert.equal(H.hintVisibleAt(1000, 1000), true)
  })
  test('숨김 타이머 지연 = 표시 길이 + 1ms (정각에는 아직 보임)', () => {
    assert.equal(H.hintHideDelayMs(), 5001)
    assert.equal(H.hintVisibleAt(H.hintHideDelayMs() - 1), true)
    assert.equal(H.hintVisibleAt(H.hintHideDelayMs()), false)
  })
})

describe('M4-11 loadingProgress — core 까지 0~100', () => {
  const MB = 1024 * 1024
  test('phase 구간: boot 0~33, core 33~100, detail/ready 100', () => {
    assert.deepEqual(L.LOADING_PHASES, ['boot', 'core', 'detail', 'ready'])
    assert.equal(Math.round(L.PHASE_SPAN.boot[1]), 33)
    assert.equal(Math.round(L.PHASE_SPAN.core[0]), 33)
    assert.equal(L.PHASE_SPAN.core[1], 100)
  })
  test('boot: 0/4MB→0, 2/4→17, 4/4→33, 초과→33', () => {
    assert.equal(L.loadingProgress('boot', 0, 4 * MB), 0)
    assert.equal(L.loadingProgress('boot', 2 * MB, 4 * MB), 17)
    assert.equal(L.loadingProgress('boot', 4 * MB, 4 * MB), 33)
    assert.equal(L.loadingProgress('boot', 9 * MB, 4 * MB), 33)
  })
  test('core: 0/8MB→33, 4/8→67, 8/8→100', () => {
    assert.equal(L.loadingProgress('core', 0, 8 * MB), 33)
    assert.equal(L.loadingProgress('core', 4 * MB, 8 * MB), 67)
    assert.equal(L.loadingProgress('core', 8 * MB, 8 * MB), 100)
  })
  test('detail·ready 는 항상 100', () => {
    assert.equal(L.loadingProgress('detail', 0, 50 * MB), 100)
    assert.equal(L.loadingProgress('ready', 0, 0), 100)
  })
  test('phaseBytes 0·음수·NaN 이면 phase 시작값, 단조증가', () => {
    assert.equal(L.loadingProgress('boot', 100, 0), 0)
    assert.equal(L.loadingProgress('core', 100, -5), 33)
    assert.equal(L.loadingProgress('core', Number.NaN, 8 * MB), 33)
    let prev = -1
    for (let b = 0; b <= 8 * MB; b += MB / 4) {
      const p = L.loadingProgress('core', b, 8 * MB)
      assert.ok(p >= prev && p >= 0 && p <= 100)
      prev = p
    }
  })
  test('isLoadingPhase · isSceneVisiblePhase', () => {
    assert.equal(L.isLoadingPhase('core'), true)
    assert.equal(L.isLoadingPhase('warmup'), false)
    assert.equal(L.isSceneVisiblePhase('core'), false)
    assert.equal(L.isSceneVisiblePhase('detail'), true)
  })
})

describe('M4-11 offline 오류 판정·문구', () => {
  test('navigator.onLine=false 면 무조건 offline', () => {
    assert.equal(L.isOfflineError(new Error('anything'), false), true)
  })
  test('fetch 실패 메시지는 offline, 그 외는 아님', () => {
    assert.equal(L.isOfflineError(new TypeError('Failed to fetch'), true), true)
    assert.equal(L.isOfflineError('net::ERR_INTERNET_DISCONNECTED', undefined), true)
    assert.equal(L.isOfflineError(new Error('HTTP 404'), true), false)
    assert.equal(L.isOfflineError(undefined, undefined), false)
  })
  test('문구', () => {
    assert.match(L.loadingErrorMessage(new TypeError('Failed to fetch'), true), /네트워크/)
    assert.match(L.loadingErrorMessage(new Error('HTTP 404'), true), /HTTP 404/)
    assert.equal(L.loadingErrorMessage(undefined, true), '불러오기에 실패했습니다.')
    for (const p of L.LOADING_PHASES) assert.ok(L.PHASE_LABEL[p].length > 0)
  })
})
