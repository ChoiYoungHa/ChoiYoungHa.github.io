import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('대화 패널 표현은 현재 줄·화자·선택지를 i18n 표에서 해소한다', async () => {
  const { createDialogue, advance } = await load('src/game/dialogue.ts')
  const { dialoguePanelPresentation } = await load('src/systems/ui/dialoguePanelLogic.ts')
  let state = createDialogue('stan', { questStatus: 'none', purchased: false })
  const first = dialoguePanelPresentation(state, 'conti')
  assert.equal(first.visible, true)
  assert.ok(first.speaker.length > 0)
  assert.ok(first.body.length > 0)
  assert.deepEqual(first.choices, [])

  state = advance(state).state
  state = advance(state).state
  state = advance(state).state
  const choosing = dialoguePanelPresentation(state, 'own')
  assert.deepEqual(choosing.choices.map(({ id }) => id), ['accept', 'decline'])
  assert.ok(choosing.choices.every(({ label }) => label.length > 0))
})

test('종료된 대화는 숨기고 내레이션은 빈 화자로 표현한다', async () => {
  const { createDialogue } = await load('src/game/dialogue.ts')
  const { dialoguePanelPresentation } = await load('src/systems/ui/dialoguePanelLogic.ts')
  const narration = dialoguePanelPresentation(createDialogue('s02', { questStatus: 'none', purchased: false }), 'conti')
  assert.equal(narration.speaker, '')
  assert.equal(dialoguePanelPresentation({ treeId: 's02', nodeId: 'intro', lineIndex: 1, finished: true }, 'conti').visible, false)
})

test('수락 금색 플래시는 시작 시각부터 0.4초 미만에만 켜진다', async () => {
  const { ACCEPT_FLASH_MS, acceptFlashVisible } = await load('src/systems/ui/dialoguePanelLogic.ts')
  assert.equal(ACCEPT_FLASH_MS, 400)
  assert.equal(acceptFlashVisible(undefined, 1_000), false)
  assert.equal(acceptFlashVisible(1_000, 999), false)
  assert.equal(acceptFlashVisible(1_000, 1_000), true)
  assert.equal(acceptFlashVisible(1_000, 1_399), true)
  assert.equal(acceptFlashVisible(1_000, 1_400), false)
})
