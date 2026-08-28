import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readItems = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/items.json'), 'utf8'))

test('궁수는 활 구매 후 1500→600 메소가 되고 자동 장착한다', async () => {
  const { createInventory, inventoryQuantity } = await load('src/game/rules/inventory.ts')
  const { buyItem } = await load('src/game/rules/shop.ts')
  const items = await readItems()
  const bow = items.find((item) => item.id === 'weapon.hunting-bow')
  const result = buyItem({ jobId: 'archer', meso: 1500, inventory: createInventory() }, bow)

  assert.equal(result.ok, true)
  assert.equal(result.state.meso, 600)
  assert.equal(result.state.inventory.equipment.weapon, bow.id)
  assert.equal(inventoryQuantity(result.state.inventory, bow.id), 1)
})

test('궁수에게 다른 세 무기는 장착 불가이며 상태가 불변이다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { buyItem } = await load('src/game/rules/shop.ts')
  const items = await readItems()
  const initial = { jobId: 'archer', meso: 1500, inventory: createInventory() }
  const incompatible = items.filter((item) => item.kind === 'weapon' && item.jobId !== 'archer')

  assert.equal(incompatible.length, 4) // 2026-08-27 1b9c1cc: 강철검+포션 3종 카탈로그
  for (const item of incompatible) {
    assert.deepEqual(buyItem(initial, item), { ok: false, reason: 'unavailable', state: initial })
  }
})

test('메소가 부족하면 구매·차감·장착이 모두 일어나지 않는다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { buyItem } = await load('src/game/rules/shop.ts')
  const items = await readItems()
  const bow = items.find((item) => item.id === 'weapon.hunting-bow')
  const initial = { jobId: 'archer', meso: 899, inventory: createInventory() }

  assert.deepEqual(buyItem(initial, bow), { ok: false, reason: 'insufficient', state: initial })
})
