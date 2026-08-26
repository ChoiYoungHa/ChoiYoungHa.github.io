import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('타이틀 진행률은 기존 3단 로딩의 boot→core→detail→ready 매핑을 재사용한다', async () => {
  const { titlePresentation } = await load('src/systems/ui/titleLogic.ts')
  assert.equal(titlePresentation({ phase: 'boot', loadedBytes: 2, phaseBytes: 4 }, 'conti').progress, 17)
  assert.equal(titlePresentation({ phase: 'core', loadedBytes: 4, phaseBytes: 8 }, 'conti').progress, 67)
  assert.equal(titlePresentation({ phase: 'detail', loadedBytes: 0, phaseBytes: 1 }, 'conti').progress, 100)
  assert.equal(titlePresentation({ phase: 'ready', loadedBytes: 0, phaseBytes: 0 }, 'conti').progress, 100)
})

test('시작 버튼은 ready이고 오류가 없을 때만 활성화되며 제목을 i18n으로 읽는다', async () => {
  const { titlePresentation } = await load('src/systems/ui/titleLogic.ts')
  const ready = titlePresentation({ phase: 'ready', loadedBytes: 0, phaseBytes: 0 }, 'conti')
  assert.equal(ready.canStart, true)
  assert.deepEqual([ready.title, ready.subtitle, ready.startLabel], ['헤네시스', '첫 여행자', '시작하기'])
  assert.equal(titlePresentation({ phase: 'core', loadedBytes: 8, phaseBytes: 8 }, 'conti').canStart, false)
  assert.equal(titlePresentation({ phase: 'ready', loadedBytes: 0, phaseBytes: 0, error: new Error('fail') }, 'conti').canStart, false)
})
