import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('런타임 준비 전 Enter 여러 번은 confirm 한 개로 보존되고 준비 시 한 번만 방출된다', async () => {
  const { INITIAL_TITLE_CONFIRM_BUFFER, queueTitleConfirm, releaseTitleConfirm } = await load('src/game/titleConfirmBuffer.ts')
  const first = queueTitleConfirm(INITIAL_TITLE_CONFIRM_BUFFER, false)
  const repeated = queueTitleConfirm(first.state, false)
  const early = releaseTitleConfirm(repeated.state, false)
  const ready = releaseTitleConfirm(early.state, true)
  const repeatedReady = releaseTitleConfirm(ready.state, true)
  assert.deepEqual([first.emit, repeated.emit, early.emit, ready.emit, repeatedReady.emit], [false, false, false, true, false])
  assert.deepEqual(ready.state, INITIAL_TITLE_CONFIRM_BUFFER)
})

test('런타임 준비 후 Enter는 버퍼 없이 즉시 confirm으로 방출된다', async () => {
  const { INITIAL_TITLE_CONFIRM_BUFFER, queueTitleConfirm } = await load('src/game/titleConfirmBuffer.ts')
  assert.deepEqual(queueTitleConfirm(INITIAL_TITLE_CONFIRM_BUFFER, true), {
    state: INITIAL_TITLE_CONFIRM_BUFFER,
    emit: true,
  })
})

test('GameOverlay와 GameRuntime은 공유 readiness seam에 연결된다', async () => {
  const [overlay, runtime] = await Promise.all([
    readFile(join(ROOT, 'src/systems/ui/GameOverlay.tsx'), 'utf8'),
    readFile(join(ROOT, 'src/scene/GameRuntime.tsx'), 'utf8'),
  ])
  assert.match(overlay, /subscribeGameRuntimeReady/)
  assert.match(overlay, /queueTitleConfirm\(/)
  assert.match(runtime, /setGameRuntimeReady\(true\)/)
})
