import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

const spawn = (id, critical = false) => ({ id, damage: 12, critical, screenX: 100, screenY: 200 })

test('플로터 풀 16개 초과 시 가장 오래된 항목을 교체하고 크리는 1.4배 금색이다', async () => {
  const { createDamageFloaterState, damageFloaterPresentation, stepDamageFloaters } = await load('src/systems/ui/damageFloaterLogic.ts')
  const spawns = Array.from({ length: 17 }, (_, index) => spawn(`hit-${index}`, index === 16))
  const state = stepDamageFloaters(createDamageFloaterState(), 0, spawns)
  const view = damageFloaterPresentation(state, 0)
  assert.equal(view.length, 16)
  assert.equal(view.some(({ id }) => id === 'hit-0'), false)
  const critical = view.find(({ id }) => id === 'hit-16')
  assert.equal(critical?.scale, 1.4)
  assert.equal(critical?.color, '#e8c37a')
})

test('데미지 플로터는 0.8초 미만만 살아 있다', async () => {
  const { createDamageFloaterState, damageFloaterPresentation, stepDamageFloaters } = await load('src/systems/ui/damageFloaterLogic.ts')
  const spawned = stepDamageFloaters(createDamageFloaterState(), 1_000, [spawn('one')])
  assert.equal(damageFloaterPresentation(stepDamageFloaters(spawned, 1_799), 1_799).length, 1)
  assert.equal(damageFloaterPresentation(stepDamageFloaters(spawned, 1_800), 1_800).length, 0)
})

test('전투 DOM 표현은 플로터 16개와 몬스터 HP 바 10개를 넘지 않는다', async () => {
  const { combatOverlayNodeCounts, createDamageFloaterState, mobHpBarPresentation, stepDamageFloaters } = await load('src/systems/ui/damageFloaterLogic.ts')
  const state = stepDamageFloaters(createDamageFloaterState(), 0, Array.from({ length: 20 }, (_, index) => spawn(`hit-${index}`)))
  const mobs = Array.from({ length: 12 }, (_, index) => ({ id: `mob-${index}`, hp: index === 0 ? 150 : 50, maxHp: 100, screenX: 20 * index, screenY: 80 }))
  const hpBars = mobHpBarPresentation(mobs)
  assert.equal(hpBars.length, 10)
  assert.equal(hpBars[0].percent, 100)
  assert.deepEqual(combatOverlayNodeCounts(state, mobs, 0), { floaters: 16, hpBars: 10, total: 26 })
})
