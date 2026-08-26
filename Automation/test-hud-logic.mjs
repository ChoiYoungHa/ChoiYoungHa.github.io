import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('HUD 표시 조건은 대화·공원·퀘스트 상태를 독립 적용한다', async () => {
  const { hudPresentation } = await load('src/systems/ui/hudLogic.ts')

  assert.deepEqual(hudPresentation({
    dialogueOpen: false,
    zone: 'park',
    questStatus: 'active',
  }), {
    showStats: true,
    showQuestTracker: true,
    showQuickSlots: true,
    showMeso: true,
  })
  assert.equal(hudPresentation({
    dialogueOpen: true,
    zone: 'park',
    questStatus: 'ready',
  }).showStats, false)
  assert.equal(hudPresentation({
    dialogueOpen: false,
    zone: 'village',
    questStatus: 'active',
  }).showQuickSlots, false)
  assert.equal(hudPresentation({
    dialogueOpen: false,
    zone: 'park',
    questStatus: 'done',
  }).showQuestTracker, false)
})

test('바 비율과 쿨다운 오버레이는 0~100으로 닫고 0 분모를 안전 처리한다', async () => {
  const { barPercent, cooldownPercent } = await load('src/systems/ui/hudLogic.ts')
  assert.equal(barPercent(176, 220), 80)
  assert.equal(barPercent(-1, 100), 0)
  assert.equal(barPercent(999, 100), 100)
  assert.equal(barPercent(10, 0), 0)
  assert.equal(cooldownPercent(1750, 3500), 50)
  assert.equal(cooldownPercent(4000, 3500), 100)
})

test('동적 퀘스트·재화 문구는 두 ipMode 문자열 표를 경유한다', async () => {
  const { hudLabels } = await load('src/systems/ui/hudLogic.ts')
  assert.deepEqual(hudLabels('conti', 7), {
    questTitle: '(Lv.10) 돼지 사냥',
    questProgress: '돼지 7/10',
    currency: '메소',
  })
  assert.deepEqual(hudLabels('own', 10), {
    questTitle: '(Lv.10) 돼지 사냥',
    questProgress: '돼지 10/10',
    currency: '코인',
  })
})

test('HUD 토큰은 콘티 §5의 1280×720 위치·크기·색을 고정한다', async () => {
  const { HUD_TOKENS } = await load('src/systems/ui/hudTokens.ts')
  assert.deepEqual(HUD_TOKENS.layout.stats, { left: 16, top: 16, width: 240, height: 92 })
  assert.deepEqual(HUD_TOKENS.layout.quest, { right: 16, top: 16, width: 220, height: 64 })
  assert.equal(HUD_TOKENS.layout.quickSlotSize, 52)
  assert.equal(HUD_TOKENS.colors.panel, 'rgba(18,20,26,0.78)')
  assert.equal(HUD_TOKENS.colors.border, 'rgba(214,178,102,0.55)')
  assert.equal(HUD_TOKENS.colors.hp, '#d94a4a')
  assert.equal(HUD_TOKENS.colors.mp, '#4a8fd9')
  assert.equal(HUD_TOKENS.colors.exp, '#c9a94a')
})
