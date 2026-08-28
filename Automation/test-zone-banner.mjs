import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('지역 배너는 진입 후 정확히 4초 동안 한 개만 표시한다', async () => {
  const { createZoneBannerState, stepZoneBanner } = await load('src/systems/ui/zoneBannerLogic.ts')
  let state = createZoneBannerState()
  state = stepZoneBanner(state, 0, [{ type: 'enter', zone: 'village' }])
  assert.equal(state.active?.zone, 'village')
  assert.equal(stepZoneBanner(state, 3_999).active?.zone, 'village')
  assert.equal(stepZoneBanner(state, 4_000).active, null)
})

test('연속 진입은 FIFO로 보관하고 앞 배너 종료 뒤부터 다음 4초를 센다', async () => {
  const { createZoneBannerState, stepZoneBanner } = await load('src/systems/ui/zoneBannerLogic.ts')
  let state = createZoneBannerState()
  state = stepZoneBanner(state, 0, [{ type: 'enter', zone: 'village' }])
  state = stepZoneBanner(state, 1_000, [{ type: 'enter', zone: 'park' }])
  assert.equal(state.active?.zone, 'village')
  assert.deepEqual(state.queue, ['park'])
  state = stepZoneBanner(state, 4_000)
  assert.equal(state.active?.zone, 'park')
  assert.equal(state.active?.startedAtMs, 4_000)
  assert.equal(stepZoneBanner(state, 7_999).active?.zone, 'park')
  assert.equal(stepZoneBanner(state, 8_000).active, null)
})

test('이탈·숲 이벤트는 배너를 만들지 않고 두 ipMode 문구만 번역한다', async () => {
  const { createZoneBannerState, stepZoneBanner, zoneBannerCopy } = await load('src/systems/ui/zoneBannerLogic.ts')
  let state = createZoneBannerState()
  state = stepZoneBanner(state, 0, [
    { type: 'exit', zone: 'village' },
    { type: 'enter', zone: 'forest' },
  ])
  assert.equal(state.active, null)
  assert.equal(zoneBannerCopy('village', 'conti').largeTitle, null)
  assert.ok(zoneBannerCopy('park', 'conti').largeTitle.length > 0)
  assert.ok(zoneBannerCopy('park', 'own').subtitle.length > 0)
})

test('2026-08-28 첫 마을 진입(퀘스트 미수락)이면 배너에 촌장 안내가 붙고, 공원·수락 후에는 없다', async () => {
  const { zoneBannerCopy } = await load('src/systems/ui/zoneBannerLogic.ts')
  assert.equal(zoneBannerCopy('village', 'own', true).hint, '촌장 오릭을 찾아가세요.')
  assert.equal(zoneBannerCopy('village', 'conti', true).hint, '장로 스탄을 찾아가세요.')
  assert.equal(zoneBannerCopy('village', 'own').hint, null)
  assert.equal(zoneBannerCopy('park', 'own', true).hint, null)
})
