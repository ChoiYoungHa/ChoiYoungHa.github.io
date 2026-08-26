import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

async function inventoryFixture() {
  const items = (await import('../src/game/data/items.json', { with: { type: 'json' } })).default
  const { createInventory, addInventoryItem, equipInventoryItem } = await load('src/game/rules/inventory.ts')
  const bow = items.find(({ id }) => id === 'weapon.hunting-bow')
  const ribbon = items.find(({ id }) => id === 'head.pig-ribbon')
  let inventory = addInventoryItem(createInventory(), bow, 1).inventory
  inventory = addInventoryItem(inventory, ribbon, 2).inventory
  inventory = equipInventoryItem(inventory, bow)
  return { inventory }
}

test('인벤토리 표현은 4×6 슬롯·장착 슬롯·스탯·hover 툴팁을 한 번에 만든다', async () => {
  const { inventory } = await inventoryFixture()
  const { inventoryPanelPresentation } = await load('src/systems/ui/inventoryPanelLogic.ts')
  const view = inventoryPanelPresentation(inventory, 0, {}, 0, 'conti')

  assert.equal(view.cells.length, 24)
  assert.equal(view.cells[0].itemId, 'weapon.hunting-bow')
  assert.equal(view.cells[0].iconUrl, '/ui/items/wpn-bow-hunting.png')
  assert.equal(view.cells[1].quantity, 2)
  assert.equal(view.equipment.weapon?.itemId, 'weapon.hunting-bow')
  assert.equal(view.equipment.head, null)
  assert.deepEqual(view.stats, { attack: 10, range: 12 })
  assert.ok(view.tooltip?.lines.some((line) => line.includes('+10')))
})

test('신규 아이템 금테 펄스는 획득부터 4초 미만이며 그 뒤 꺼진다', async () => {
  const { inventory } = await inventoryFixture()
  const { NEW_ITEM_PULSE_MS, inventoryPanelPresentation } = await load('src/systems/ui/inventoryPanelLogic.ts')
  assert.equal(NEW_ITEM_PULSE_MS, 4_000)
  const times = { 'weapon.hunting-bow': 1_000 }
  assert.equal(inventoryPanelPresentation(inventory, null, times, 4_999, 'conti').cells[0].isNew, true)
  assert.equal(inventoryPanelPresentation(inventory, null, times, 5_000, 'conti').cells[0].isNew, false)
})
