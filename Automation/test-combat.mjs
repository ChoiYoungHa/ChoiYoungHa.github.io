import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('기본공격은 전방 1.8m·60° 경계를 포함하고 가장 가까운 한 대상만 맞힌다', async () => {
  const { resolveBasicAttack } = await load('src/game/rules/combat.ts')
  const boundaryX = Math.sin(Math.PI / 6) * 1.8
  const boundaryZ = -Math.cos(Math.PI / 6) * 1.8
  const targets = [
    { id: 'near', position: { x: 0, z: -1 } },
    { id: 'range-boundary', position: { x: 0, z: -1.8 } },
    { id: 'angle-boundary', position: { x: boundaryX, z: boundaryZ } },
    { id: 'too-far', position: { x: 0, z: -1.801 } },
    { id: 'behind', position: { x: 0, z: 1 } },
  ]
  const result = resolveBasicAttack({
    origin: { x: 0, z: 0 },
    yaw: 0,
    baseAttack: 12,
    weaponAttack: 10,
    targets,
    rng: () => 0.5,
  })

  assert.equal(result.hits.length, 1)
  assert.deepEqual(result.hits[0], {
    targetId: 'near',
    damage: 22,
    critical: false,
    hitIndex: 0,
  })
})

test('4스킬은 기하 규칙과 대상 수 상한 3/5/1/2를 지키고 stats 데미지를 쓴다', async () => {
  const { resolveSkillAttack } = await load('src/game/rules/combat.ts')
  const common = {
    origin: { x: 0, z: 0 },
    yaw: 0,
    baseAttack: 10,
    weaponAttack: 10,
    rng: () => 0.5,
  }

  const warriorBoundary = {
    id: 'w-boundary',
    position: { x: Math.sin(Math.PI / 3) * 2, z: -Math.cos(Math.PI / 3) * 2 },
  }
  const warrior = resolveSkillAttack({
    ...common,
    skillId: 'flame-slash',
    targets: [
      { id: 'w-near', position: { x: 0, z: -1 } },
      { id: 'w-mid', position: { x: -1, z: -2 } },
      warriorBoundary,
      { id: 'w-fourth', position: { x: 0.5, z: -2.8 } },
      { id: 'w-outside', position: { x: 2.7, z: -1.2 } },
    ],
  })
  assert.equal(new Set(warrior.hits.map((hit) => hit.targetId)).size, 3)
  assert.ok(warrior.hits.some((hit) => hit.targetId === warriorBoundary.id))
  assert.ok(warrior.hits.every((hit) => hit.damage === 36))
  assert.equal(warrior.effect.type, 'burn')

  const archer = resolveSkillAttack({
    ...common,
    skillId: 'rainbow-shot',
    targets: [-1.5, -1, -0.5, 0, 0.5, 1].map((x, index) => ({
      id: `a-${index}`,
      position: { x, z: -8 },
    })),
  })
  assert.equal(new Set(archer.hits.map((hit) => hit.targetId)).size, 5)
  assert.ok(archer.hits.every((hit) => hit.damage === 14))

  const mage = resolveSkillAttack({
    ...common,
    skillId: 'ice-age',
    targetId: 'm-selected',
    targets: [
      { id: 'm-other', position: { x: 0, z: -2 } },
      { id: 'm-selected', position: { x: 20, z: 20 } },
    ],
  })
  assert.equal(mage.hits.length, 3)
  assert.deepEqual(new Set(mage.hits.map((hit) => hit.targetId)), new Set(['m-selected']))
  assert.deepEqual(mage.hits.map((hit) => hit.hitIndex), [0, 1, 2])
  assert.ok(mage.hits.every((hit) => hit.damage === 30))

  const thief = resolveSkillAttack({
    ...common,
    skillId: 'leaping-slash',
    impactPosition: { x: 10, z: 10 },
    targets: [
      { id: 't-center', position: { x: 10, z: 10 } },
      { id: 't-mid', position: { x: 10, z: 12 } },
      { id: 't-boundary', position: { x: 12.5, z: 10 } },
      { id: 't-outside', position: { x: 12.501, z: 10 } },
    ],
  })
  assert.equal(new Set(thief.hits.map((hit) => hit.targetId)).size, 2)
  assert.ok(thief.hits.every((hit) => hit.damage === 48))
})

test('몬스터 공8 피격 뒤 0.5초 무적이며 경계 시각부터 다시 피해를 받는다', async () => {
  const { applyMonsterHit } = await load('src/game/rules/combat.ts')
  const initial = { hp: 16, invulnerableUntilSeconds: 0 }
  const first = applyMonsterHit(initial, { damage: 8, nowSeconds: 0 })
  assert.deepEqual(first, {
    state: { hp: 8, invulnerableUntilSeconds: 0.5 },
    damageApplied: 8,
    died: false,
  })

  const blocked = applyMonsterHit(first.state, { damage: 8, nowSeconds: 0.499 })
  assert.deepEqual(blocked, { state: first.state, damageApplied: 0, died: false })

  const lethal = applyMonsterHit(first.state, { damage: 8, nowSeconds: 0.5 })
  assert.deepEqual(lethal, {
    state: { hp: 0, invulnerableUntilSeconds: 1 },
    damageApplied: 8,
    died: true,
  })
})
