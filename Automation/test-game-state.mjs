import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('궁수 초기 상태가 직업 스탯·24칸 인벤·게임 메타를 한 번에 만든다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const state = createInitialState('archer', '영하')

  assert.equal(state.jobId, 'archer')
  assert.equal(state.name, '영하')
  assert.deepEqual(
    [state.level, state.hp, state.maxHp, state.mp, state.maxMp, state.exp, state.meso],
    [1, 160, 160, 80, 80, 0, 1500],
  )
  assert.equal(state.inventory.slots.length, 24)
  assert.deepEqual(state.equipment, { weapon: null, head: null })
  assert.deepEqual(state.quest, { questId: 'pig-cleanup', status: 'none', killCount: 0 })
  assert.equal(state.scene, 'title')
  assert.equal(state.ipMode, 'own')
  assert.deepEqual(state.faceParts, {
    faceId: 'round',
    eyeId: 'basic',
    noseId: 'dot',
    mouthId: 'smile',
    hairId: 'short',
    skinId: 'skin-warm',
    hairColorId: 'hair-espresso',
    eyeColorId: 'eye-brown',
    outfitId: 'archer',
  })
})

test('직업 선택·피해·회복은 최대/최소 경계를 지키고 원본을 바꾸지 않는다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { reduce } = await load('src/game/reducers.ts')
  const initial = createInitialState(null, '')
  const selected = reduce(initial, { type: 'select-job', jobId: 'warrior', name: '여행자' })
  const damaged = reduce(selected, { type: 'damage', amount: 999 })
  const healed = reduce(damaged, { type: 'heal', hp: 999, mp: 999 })

  assert.deepEqual([selected.hp, selected.maxHp, selected.mp, selected.maxMp], [220, 220, 60, 60])
  assert.equal(selected.name, '여행자')
  assert.equal(selected.faceParts.outfitId, 'warrior')
  assert.equal(damaged.hp, 0)
  assert.deepEqual([healed.hp, healed.mp], [220, 60])
  assert.equal(initial.jobId, null)
  assert.equal(initial.hp, 0)
})

test('EXP는 연쇄 레벨업하고 메소 감소는 0 아래로 내려가지 않는다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { reduce } = await load('src/game/reducers.ts')
  const initial = createInitialState('mage', '루미')
  const leveled = reduce(initial, { type: 'gain-exp', amount: 430 })
  const spent = reduce(leveled, { type: 'adjust-meso', amount: -9999 })

  assert.deepEqual([leveled.level, leveled.exp], [4, 220])
  assert.equal(spent.meso, 0)
})

test('구매와 아이템 획득은 M6-08·09 결과를 상태/장착에 동기화한다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { reduce } = await load('src/game/reducers.ts')
  const { inventoryQuantity } = await load('src/game/rules/inventory.ts')
  const items = await readJson('src/game/data/items.json')
  const byId = Object.fromEntries(items.map((item) => [item.id, item]))
  let state = createInitialState('archer', '로빈')

  state = reduce(state, { type: 'purchase', item: byId['weapon.hunting-bow'] })
  state = reduce(state, { type: 'gain-item', item: byId['head.pig-ribbon'], quantity: 2 })

  assert.equal(state.meso, 600)
  assert.equal(state.equipment.weapon, 'weapon.hunting-bow')
  assert.deepEqual(state.equipment, state.inventory.equipment)
  assert.equal(inventoryQuantity(state.inventory, 'head.pig-ribbon'), 2)
})

test('퀘스트와 씬 액션은 R76 상태기계를 재사용하고 보상은 한 번만 반영한다', async () => {
  const { createInitialState } = await load('src/game/state.ts')
  const { reduce } = await load('src/game/reducers.ts')
  const { inventoryQuantity } = await load('src/game/rules/inventory.ts')
  const quests = await readJson('src/game/data/quests.json')
  const quest = quests['pig-cleanup']
  let state = reduce(createInitialState('warrior', '테오'), { type: 'quest-accept' })
  for (let index = 0; index < 10; index += 1) {
    state = reduce(state, { type: 'quest-kill', quest, monsterId: 'pig' })
  }
  state = reduce(state, { type: 'quest-complete', quest })
  const completed = state
  state = reduce(state, { type: 'quest-complete', quest })
  state = reduce(state, { type: 'scene-transition', scene: 'complete' })

  assert.equal(state.quest.status, 'done')
  assert.equal(state.meso, 4500)
  assert.deepEqual([state.level, state.exp], [4, 40])
  assert.equal(inventoryQuantity(state.inventory, 'head.pig-ribbon'), 1)
  assert.equal(state.scene, 'complete')
  assert.deepEqual(state.meso, completed.meso)
})
