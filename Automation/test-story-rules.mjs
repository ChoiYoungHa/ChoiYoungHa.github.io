import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

test('§9-3 궁수 구매→돼지 10마리→퀘스트 완료 수치를 재현한다', async () => {
  const inventoryRules = await load('src/game/rules/inventory.ts')
  const { buyItem } = await load('src/game/rules/shop.ts')
  const { rollDrops } = await load('src/game/rules/drops.ts')
  const questRules = await load('src/game/rules/quest.ts')
  const { applyExperience } = await load('src/game/rules/stats.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const items = await readJson('src/game/data/items.json')
  const monsters = await readJson('src/game/data/monsters.json')
  const quests = await readJson('src/game/data/quests.json')
  const itemById = Object.fromEntries(items.map((item) => [item.id, item]))
  const bow = itemById['weapon.hunting-bow']
  const pig = monsters.pig
  const quest = quests['pig-cleanup']

  const purchase = buyItem({
    jobId: 'archer',
    meso: 1500,
    inventory: inventoryRules.createInventory(),
  }, bow)
  assert.equal(purchase.ok, true)
  assert.equal(purchase.state.meso, 600)

  let meso = purchase.state.meso
  let inventory = purchase.state.inventory
  let experience = { level: 1, exp: 0 }
  let progress = questRules.acceptQuest(questRules.createQuestProgress(quest.id))
  const rng = mulberry32(45)

  for (let index = 0; index < 10; index += 1) {
    const drop = rollDrops(pig.drops, rng)
    meso += drop.meso
    for (const stack of drop.items) {
      inventory = inventoryRules.addInventoryItem(inventory, itemById[stack.itemId], stack.quantity).inventory
    }
    experience = applyExperience(experience, pig.exp)
    progress = questRules.recordQuestKill(progress, quest, pig.id)
  }

  assert.equal(meso, 785)
  assert.equal(inventoryRules.inventoryQuantity(inventory, 'head.pig-ribbon'), 1)
  assert.deepEqual(experience, { level: 3, exp: 105, levelsGained: 0 })
  assert.deepEqual(progress, { questId: quest.id, status: 'ready', killCount: 10 })

  const completion = questRules.completeQuest(progress, quest)
  assert.equal(completion.progress.status, 'done')
  meso += completion.rewards.meso
  experience = applyExperience(experience, completion.rewards.exp)
  for (const stack of completion.rewards.items) {
    inventory = inventoryRules.addInventoryItem(inventory, itemById[stack.itemId], stack.quantity).inventory
  }

  assert.equal(meso, 3785)
  assert.deepEqual(experience, { level: 4, exp: 220, levelsGained: 1 })
  assert.equal(inventoryRules.inventoryQuantity(inventory, 'head.pig-ribbon'), 2)
})
