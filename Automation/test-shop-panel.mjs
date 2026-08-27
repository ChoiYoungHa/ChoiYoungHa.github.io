import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('궁수 상점은 자기 무기만 활성화하고 구매하면 900 메소를 차감한다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { shopPanelPresentation, purchaseShopItem } = await load('src/systems/ui/shopPanelLogic.ts')
  const state = { jobId: 'archer', meso: 1_500, inventory: createInventory() }
  const view = shopPanelPresentation(state, 'weapon.hunting-bow', 'conti')

  assert.equal(view.items.length, 4)
  assert.equal(view.items.filter(({ disabled }) => disabled).length, 3)
  assert.equal(view.items.find(({ id }) => id === 'weapon.hunting-bow')?.disabled, false)
  assert.ok(view.items.filter(({ id }) => id !== 'weapon.hunting-bow').every(({ disabledReason }) => disabledReason === '장착 불가'))
  assert.equal(view.detail?.id, 'weapon.hunting-bow')
  assert.equal(view.detail?.iconUrl, '/ui/icons/wpn-bow-hunting.png')

  const result = purchaseShopItem(state, 'weapon.hunting-bow')
  assert.equal(result.ok, true)
  assert.equal(result.state.meso, 600)
  assert.equal(result.state.inventory.equipment.weapon, 'weapon.hunting-bow')
})

test('잔액 부족은 규칙 모듈 판정을 ipMode 문구로 표시한다', async () => {
  const { createInventory } = await load('src/game/rules/inventory.ts')
  const { shopPanelPresentation } = await load('src/systems/ui/shopPanelLogic.ts')
  const state = { jobId: 'archer', meso: 800, inventory: createInventory() }
  assert.equal(shopPanelPresentation(state, 'weapon.hunting-bow', 'conti').detail?.disabledReason, '메소 부족')
  assert.equal(shopPanelPresentation(state, 'weapon.hunting-bow', 'own').detail?.disabledReason, '코인 부족')
})
