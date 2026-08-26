import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('드롭은 0.4초 포물선 뒤 밑동 높이에 결정론적으로 착지한다', async () => {
  const pickup = await load('src/game/rules/pickup.ts')
  const table = {
    meso: { min: 10, max: 30 },
    items: [{ itemId: 'head.pig-ribbon', chance: 0.15, quantity: 1 }],
  }
  const entities = pickup.createDropEntities(table, { x: 4, y: 2, z: -3 }, 10, () => 0, {
    sequence: 7,
    sourceMonsterId: 'pig',
  })

  assert.equal(entities.length, 2)
  assert.deepEqual(pickup.parabolicPosition(entities[0], 10), { x: 4, y: 2, z: -3 })
  assert.ok(pickup.parabolicPosition(entities[0], 10.2).y > 2.7)
  assert.deepEqual(pickup.parabolicPosition(entities[0], 10.4), entities[0].landingPosition)
  assert.deepEqual(pickup.parabolicPosition(entities[0], 99), entities[0].landingPosition)
})

test('1.5m 경계 안에서만 착지한 드롭을 습득한다', async () => {
  const pickup = await load('src/game/rules/pickup.ts')
  const entity = pickup.createDropEntities({ meso: { min: 10, max: 10 }, items: [] }, {
    x: 0,
    y: 0,
    z: 0,
  }, 0, () => 0, { sequence: 1, sourceMonsterId: 'pig' })[0]

  assert.equal(pickup.canPickup(entity, { x: 0, y: 0, z: 0 }, 0.39), false)
  assert.equal(pickup.canPickup(entity, { x: entity.landingPosition.x + 1.5, y: 0, z: 0 }, 0.4), true)
  assert.equal(pickup.canPickup(entity, { x: entity.landingPosition.x + 1.501, y: 0, z: 0 }, 0.4), false)
})

test('I-07 습득은 보상만 반영하고 처치 카운트는 드롭과 분리한다', async () => {
  const pickup = await load('src/game/rules/pickup.ts')
  const { createInitialState } = await load('src/game/state.ts')
  const { reduce } = await load('src/game/reducers.ts')
  const quests = (await import('../src/game/data/quests.json', { with: { type: 'json' } })).default
  const quest = quests['pig-cleanup']
  const table = {
    meso: { min: 10, max: 30 },
    items: [{ itemId: 'head.pig-ribbon', chance: 0.15, quantity: 1 }],
  }
  const entities = pickup.createDropEntities(table, { x: 0, y: 0, z: 0 }, 0, () => 0, {
    sequence: 2,
    sourceMonsterId: 'pig',
  })
  let game = reduce(createInitialState('archer', '테스터'), { type: 'quest-accept' })

  const tooFar = pickup.collectDrop(game, entities[0], quest, { x: 99, y: 0, z: 99 }, 1)
  assert.equal(tooFar.collected, false)
  assert.equal(tooFar.state, game)

  const meso = pickup.collectDrop(game, entities[0], quest, entities[0].landingPosition, 1)
  assert.equal(meso.collected, true)
  assert.deepEqual(meso.actions.map((action) => action.type), ['adjust-meso'])
  assert.equal(meso.state.meso, 1510)
  assert.equal(meso.state.quest.killCount, 0)
  game = meso.state

  const ribbon = pickup.collectDrop(game, entities[1], quest, entities[1].landingPosition, 1)
  assert.deepEqual(ribbon.actions.map((action) => action.type), ['gain-item'])
  assert.equal(ribbon.state.quest.killCount, 0)
  assert.equal(ribbon.state.inventory.slots.some((slot) => slot?.itemId === 'head.pig-ribbon'), true)
})

test('I-06 세션용 드롭 컬렉션은 24개를 넘으면 가장 오래된 엔티티를 교체한다', async () => {
  const pickup = await load('src/game/rules/pickup.ts')
  const template = pickup.createDropEntities({ meso: { min: 10, max: 10 }, items: [] }, { x: 0, y: 0, z: 0 }, 0, () => 0, { sequence: 1, sourceMonsterId: 'pig' })[0]
  let collection = pickup.createDropCollection()
  for (let index = 0; index < 25; index += 1) {
    collection = pickup.addDropToCollection(collection, { ...template, id: `drop-${index}` }, index).collection
  }
  assert.equal(pickup.dropCollectionValues(collection).length, 24)
  assert.equal(pickup.dropCollectionValues(collection).some(({ id }) => id === 'drop-0'), false)
  const removed = pickup.removeDropFromCollection(collection, 'drop-1')
  assert.equal(pickup.dropCollectionValues(removed).length, 23)
})
