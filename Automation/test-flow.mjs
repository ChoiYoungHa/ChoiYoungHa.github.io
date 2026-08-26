import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('11개 씬을 순서대로 진입하면 매 단계 전제가 충족된다', async () => {
  const { createInitialState, GAME_SCENES } = await load('src/game/state.ts')
  const { canEnter, enter } = await load('src/game/flow.ts')
  assert.deepEqual(GAME_SCENES, [
    'title', 'create', 'forest', 'henesys', 'stan', 'shop',
    'park', 'hunt', 'complete', 'epilogue', 'free',
  ])

  let state = createInitialState(null, '')
  for (const scene of GAME_SCENES) {
    state = enter(scene, state)
    assert.equal(state.scene, scene)
    assert.equal(canEnter(scene, state), true)
  }
  assert.equal(state.jobId, 'warrior')
  assert.equal(state.quest.status, 'done')
})

test('complete 직접 진입은 기본 전사·이름·active→ready 10/10을 자동 보정한다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { canEnter, enter } = await load('src/game/flow.ts')
  const initial = createInitialState(null, '')
  assert.equal(canEnter('complete', initial), false)

  const corrected = enter('complete', initial)
  assert.equal(corrected.scene, 'complete')
  assert.equal(corrected.jobId, 'warrior')
  assert.equal(corrected.name, '여행자')
  assert.deepEqual(corrected.quest, {
    questId: 'pig-cleanup',
    status: 'ready',
    killCount: 10,
  })
  assert.equal(canEnter('complete', corrected), true)
})

test('epilogue 직접 진입은 완료 보상을 한 번 반영하고 done으로 보정한다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { enter } = await load('src/game/flow.ts')
  const epilogue = enter('epilogue', createInitialState(null, ''))
  const repeated = enter('epilogue', epilogue)

  assert.equal(epilogue.quest.status, 'done')
  assert.equal(epilogue.quest.killCount, 10)
  assert.equal(epilogue.meso, 4500)
  assert.deepEqual([epilogue.level, epilogue.exp], [4, 40])
  assert.equal(repeated.meso, 4500)
})

test('진행한 씬보다 앞선 씬으로의 역행은 상태 전체를 바꾸지 않는다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { canEnter, enter } = await load('src/game/flow.ts')
  const advanced = enter('epilogue', createInitialState(null, ''))

  assert.equal(canEnter('forest', advanced), false)
  assert.equal(enter('forest', advanced), advanced)
})

test('?scene= 파서는 URL·쿼리 문자열만 읽고 허용 씬 외 값은 null이다', async () => {
  const { parseSceneQuery } = await load('src/game/flow.ts')
  assert.equal(parseSceneQuery('?scene=stan'), 'stan')
  assert.equal(parseSceneQuery('https://example.test/game?q=low&scene=park'), 'park')
  assert.equal(parseSceneQuery('?scene=S03'), null)
  assert.equal(parseSceneQuery('?scene=unknown'), null)
  assert.equal(parseSceneQuery('not a url'), null)
})
