import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readItems = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/items.json'), 'utf8'))

test('인벤토리는 4×6 고정이며 메소는 아이템 슬롯에 들어가지 않는다', async () => {
  const { createInventory, addInventoryItem } = await load('src/game/rules/inventory.ts')
  const items = await readItems()
  const inventory = createInventory()

  assert.equal(inventory.slots.length, 24)
  assert.throws(() => addInventoryItem(inventory, items.find((item) => item.id === 'currency.meso'), 10), /separate/)
})

test('동일 아이템은 stackLimit까지 합쳐지고 넘친 수량은 다음 슬롯을 쓴다', async () => {
  const { createInventory, addInventoryItem, inventoryQuantity } = await load('src/game/rules/inventory.ts')
  const items = await readItems()
  const ribbon = items.find((item) => item.id === 'head.pig-ribbon')
  const result = addInventoryItem(createInventory(), ribbon, 25)

  assert.equal(result.added, 25)
  assert.equal(result.remainder, 0)
  assert.equal(result.inventory.slots.filter(Boolean).length, 2)
  assert.equal(inventoryQuantity(result.inventory, ribbon.id), 25)
})

test('24칸을 넘는 아이템은 거절되고 기존 상태를 바꾸지 않는다', async () => {
  const { createInventory, addInventoryItem } = await load('src/game/rules/inventory.ts')
  const items = await readItems()
  const sword = items.find((item) => item.id === 'weapon.wooden-sword')
  let inventory = createInventory()
  for (let index = 0; index < 24; index += 1) {
    inventory = addInventoryItem(inventory, sword, 1).inventory
  }
  const full = inventory
  const rejected = addInventoryItem(full, sword, 1)

  assert.equal(rejected.added, 0)
  assert.equal(rejected.remainder, 1)
  assert.deepEqual(rejected.inventory, full)
})

test('무기·머리 장착과 리본 luck+1이 툴팁/유효 보너스에 반영된다', async () => {
  const {
    addInventoryItem,
    createInventory,
    effectiveBonuses,
    equipInventoryItem,
    tooltipForItem,
  } = await load('src/game/rules/inventory.ts')
  const items = await readItems()
  const byId = Object.fromEntries(items.map((item) => [item.id, item]))
  const ribbon = byId['head.pig-ribbon']
  const withRibbon = addInventoryItem(createInventory(), ribbon, 1).inventory
  const equipped = equipInventoryItem(withRibbon, ribbon)

  assert.equal(equipped.equipment.head, ribbon.id)
  assert.deepEqual(effectiveBonuses(equipped, byId), { luck: 1 })
  assert.match(tooltipForItem(ribbon), /행운 \+1/)
})
