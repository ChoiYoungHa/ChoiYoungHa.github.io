import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readSkills = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/skills.json'), 'utf8'))

test('네 직업 스킬이 배수·MP·쿨다운·대상 수를 정의한다', async () => {
  const skills = await readSkills()
  assert.deepEqual(Object.keys(skills), ['flame-slash', 'rainbow-shot', 'ice-age', 'leaping-slash'])
  assert.deepEqual(
    Object.values(skills).map((skill) => [skill.multiplier, skill.mpCost, skill.cooldownMs, skill.targetCount]),
    [
      [1.8, 12, 3000, 3],
      [0.7, 15, 3500, 5],
      [1.5, 20, 5000, 1],
      [2.4, 14, 4000, 2],
    ],
  )
})

test('불꽃베기는 MP를 차감하고 3초·5틱·합계15 화상을 반환한다', async () => {
  const { createSkillState, tryCastSkill } = await load('src/game/rules/skills.ts')
  const skills = await readSkills()
  const result = tryCastSkill(createSkillState(60), skills['flame-slash'], 1000)

  assert.equal(result.ok, true)
  assert.equal(result.state.mp, 48)
  assert.equal(result.state.readyAt['flame-slash'], 4000)
  assert.deepEqual(result.effect, {
    type: 'burn',
    durationMs: 3000,
    ticks: 5,
    damagePerTick: 3,
    totalDamage: 15,
  })
})

test('MP 부족은 상태를 바꾸지 않고 명시적 사유를 반환한다', async () => {
  const { createSkillState, tryCastSkill } = await load('src/game/rules/skills.ts')
  const skills = await readSkills()
  const initial = createSkillState(19)

  assert.deepEqual(tryCastSkill(initial, skills['ice-age'], 0), {
    ok: false,
    reason: 'MP 부족',
    state: initial,
  })
})

test('쿨다운 도중은 거절되고 경계 시각에는 다시 시전된다', async () => {
  const { createSkillState, tryCastSkill } = await load('src/game/rules/skills.ts')
  const skills = await readSkills()
  const first = tryCastSkill(createSkillState(100), skills['rainbow-shot'], 500)
  assert.equal(first.ok, true)

  assert.deepEqual(tryCastSkill(first.state, skills['rainbow-shot'], 3999), {
    ok: false,
    reason: '쿨다운 중',
    state: first.state,
  })
  assert.equal(tryCastSkill(first.state, skills['rainbow-shot'], 4000).ok, true)
})
