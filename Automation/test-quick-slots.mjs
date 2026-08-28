import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reduce } from '../src/game/reducers.ts'
import { createInitialState } from '../src/game/state.ts'
import { inventoryQuantity } from '../src/game/rules/inventory.ts'
import rawItems from '../src/game/data/items.json' with { type: 'json' }
import { createSession } from '../src/game/session.ts'

const potion = rawItems.find((i) => i.id === 'consumable.potion-hp-s')
const sword = rawItems.find((i) => i.id === 'weapon.wooden-sword')

test('bind-quick-slot: 소비 아이템만, 중복 등록 시 이전 슬롯 비움, null 로 해제', () => {
  let s = createInitialState('warrior', '영하')
  assert.deepEqual(s.quickSlots, { 3: null, 4: null, 5: null, 6: null })
  s = reduce(s, { type: 'bind-quick-slot', slot: 3, itemId: potion.id })
  assert.equal(s.quickSlots['3'], potion.id)
  s = reduce(s, { type: 'bind-quick-slot', slot: 5, itemId: potion.id })
  assert.equal(s.quickSlots['3'], null)
  assert.equal(s.quickSlots['5'], potion.id)
  const unchanged = reduce(s, { type: 'bind-quick-slot', slot: 4, itemId: sword.id })
  assert.equal(unchanged.quickSlots['4'], null)
  s = reduce(s, { type: 'bind-quick-slot', slot: 5, itemId: null })
  assert.equal(s.quickSlots['5'], null)
})

test('session: 상점에서 산 물약을 퀵슬롯 4 에 등록(bindQuickSlot) → quickSlot 4 입력으로 소비, stats 토글·Esc', () => {
  const session = createSession({ seed: 95, ipMode: 'own' })
  const tick = (playerPos, playerYaw = 0, inputs = {}, dtMs = 16) => session.tick({ dtMs, playerPos, playerYaw, inputs })
  const snap = () => session.getSnapshot()
  tick({ x: 0, z: 24 }, 0, { confirm: true })
  tick({ x: 0, z: 24 }, 0, { confirm: true, character: { jobId: 'warrior', name: '영하' } })
  // test-session 과 같은 경로: 스탄 퀘스트 수락 → 마야 상점 → 물약 구매
  const stan = { x: -4.104056, z: 4.276014 }
  tick(stan, 0, { interact: true })
  for (let index = 0; index < 3; index += 1) tick(stan, 0, { confirm: true })
  tick(stan, 0, { choice: 'accept' })
  tick(stan, 0, { confirm: true })
  tick(stan, 0, { confirm: true })
  const maya = { x: -5.44966, z: 18.660593 }
  tick(maya, 0, { interact: true })
  for (let index = 0; index < 6 && snap().game.scene !== 'shop'; index += 1) tick(maya, 0, { confirm: true })
  assert.equal(snap().game.scene, 'shop')
  tick(maya, 0, { confirm: true }) // 진입 직후 첫 confirm 은 가드가 삼킨다
  tick(maya, 0, { confirm: true, selectedItemId: potion.id })
  assert.equal(inventoryQuantity(snap().game.inventory, potion.id), 1)
  tick(maya, 0, { bindQuickSlot: { slot: 4, itemId: potion.id } })
  assert.equal(snap().game.quickSlots['4'], potion.id)
  tick(maya, 0, { quickSlot: 4 })
  assert.equal(inventoryQuantity(snap().game.inventory, potion.id), 0)
  tick(maya, 0, { quickSlot: 4 }) // 비어 있으면 아무 일도 없다
  assert.equal(inventoryQuantity(snap().game.inventory, potion.id), 0)
  assert.equal(snap().statsOpen, false)
  tick(maya, 0, { stats: true })
  assert.equal(snap().statsOpen, true)
  tick(maya, 0, { cancel: true })
  assert.equal(snap().statsOpen, false)
})
