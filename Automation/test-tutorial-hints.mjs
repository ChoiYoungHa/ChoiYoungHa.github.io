import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('튜토리얼은 WASD→Shift→Space 순서를 강제하고 중복·선행 이벤트를 무시한다', async () => {
  const { createTutorialHintsState, stepTutorialHints } = await load('src/systems/ui/tutorialHintsLogic.ts')
  let state = createTutorialHintsState()
  state = stepTutorialHints(state, 'run')
  assert.deepEqual(state.completed, [])
  state = stepTutorialHints(state, 'move')
  state = stepTutorialHints(state, 'move')
  state = stepTutorialHints(state, 'jump')
  assert.deepEqual(state.completed, ['move'])
  state = stepTutorialHints(state, 'run')
  state = stepTutorialHints(state, 'jump')
  assert.deepEqual(state.completed, ['move', 'run', 'jump'])
  assert.equal(state.complete, true)
})

test('3개 완료 뒤 길 안내로 전환하고 내레이션 두 줄을 i18n으로 제공한다', async () => {
  const { tutorialHintsPresentation, tutorialStateFromEvents } = await load('src/systems/ui/tutorialHintsLogic.ts')
  const state = tutorialStateFromEvents(['move', 'run', 'jump', 'jump'])
  const view = tutorialHintsPresentation(state, 'conti')
  assert.deepEqual(view.hints.map(({ label, completed }) => [label, completed]), [
    ['WASD 이동', true],
    ['Shift 달리기', true],
    ['Space 점프', true],
  ])
  assert.equal(view.followText, '길을 따라가세요')
  assert.deepEqual(view.narrationLines, ['얼마나 잤는지 모르겠다.', '나무 그늘 밖으로 길이 하나 나 있었다.'])
})
