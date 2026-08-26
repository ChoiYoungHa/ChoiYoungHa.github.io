import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('에필로그 세 줄은 1.2초 간격으로 0.6초 페이드 인한다', async () => {
  const { EPILOGUE_FADE_MS, EPILOGUE_LINE_INTERVAL_MS, epiloguePresentation } = await load('src/systems/ui/epilogueLogic.ts')
  assert.equal(EPILOGUE_LINE_INTERVAL_MS, 1_200)
  assert.equal(EPILOGUE_FADE_MS, 600)
  assert.deepEqual(epiloguePresentation(0, 'conti').lines.map(({ opacity }) => opacity), [0, 0, 0])
  assert.deepEqual(epiloguePresentation(600, 'conti').lines.map(({ opacity }) => opacity), [1, 0, 0])
  assert.deepEqual(epiloguePresentation(1_500, 'conti').lines.map(({ opacity }) => opacity), [1, 0.5, 0])
  assert.deepEqual(epiloguePresentation(3_000, 'conti').lines.map(({ opacity }) => opacity), [1, 1, 1])
})

test('세 번째 줄 페이드 완료 뒤 다시 하기·자유 탐험을 표시한다', async () => {
  const { epiloguePresentation } = await load('src/systems/ui/epilogueLogic.ts')
  assert.equal(epiloguePresentation(2_999, 'conti').showActions, false)
  const complete = epiloguePresentation(3_000, 'conti')
  assert.equal(complete.showActions, true)
  assert.deepEqual(complete.actions, { retry: '다시 하기', freeExplore: '자유 탐험' })
})
