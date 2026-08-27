import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('전사 상점은 강철검+포션 4종을 팔고 강철검 구매 시 1,200 메소를 차감한다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { shopPanelPresentation, purchaseShopItem } = await load('src/systems/ui/shopPanelLogic.ts')
  const state = { jobId: 'warrior', meso: 1_500, inventory: createInventory() }
  const view = shopPanelPresentation(state, 'weapon.steel-sword', 'conti')

  assert.equal(view.items.length, 4)
  assert.equal(view.items.filter(({ disabled }) => disabled).length, 0)
  assert.deepEqual(view.items.map(({ id }) => id).sort(), ['consumable.potion-hp-m', 'consumable.potion-hp-s', 'consumable.potion-mp-s', 'weapon.steel-sword'])
  assert.equal(view.detail?.id, 'weapon.steel-sword')
  assert.equal(view.detail?.iconUrl, '/ui/icons/wpn-sword-steel.png')

  const result = purchaseShopItem(state, 'weapon.steel-sword')
  assert.equal(result.ok, true)
  assert.equal(result.state.meso, 300)
  assert.equal(result.state.inventory.equipment.weapon, 'weapon.steel-sword')
})

test('잔액 부족은 규칙 모듈 판정을 ipMode 문구로 표시한다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { shopPanelPresentation } = await load('src/systems/ui/shopPanelLogic.ts')
  const state = { jobId: 'warrior', meso: 800, inventory: createInventory() }
  assert.equal(shopPanelPresentation(state, 'weapon.steel-sword', 'conti').detail?.disabledReason, '메소 부족')
  assert.equal(shopPanelPresentation(state, 'weapon.steel-sword', 'own').detail?.disabledReason, '코인 부족')
})
