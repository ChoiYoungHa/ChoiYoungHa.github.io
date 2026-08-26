import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('jobs 데이터가 네 직업의 콘티 시작 능력치를 보존한다', async () => {
  const jobs = JSON.parse(await readFile(join(ROOT, 'src/game/data/jobs.json'), 'utf8'))

  assert.deepEqual(Object.keys(jobs), ['warrior', 'archer', 'mage', 'thief'])
  assert.deepEqual(
    Object.fromEntries(Object.entries(jobs).map(([id, job]) => [id, [job.startHp, job.startMp, job.baseAttack]])),
    {
      warrior: [220, 60, 14],
      archer: [160, 80, 12],
      mage: [130, 140, 10],
      thief: [175, 90, 13],
    },
  )
})

test('레벨별 필요 경험치는 15 × Lv²이다', async () => {
  const { expRequiredForLevel } = await load('src/game/rules/stats.ts')

  assert.equal(expRequiredForLevel(1), 15)
  assert.equal(expRequiredForLevel(2), 60)
  assert.equal(expRequiredForLevel(3), 135)
})

test('경험치 적용은 여러 레벨 상승과 나머지 경험치를 결정론적으로 계산한다', async () => {
  const { applyExperience } = await load('src/game/rules/stats.ts')

  assert.deepEqual(applyExperience({ level: 1, exp: 0 }, 180), {
    level: 3,
    exp: 105,
    levelsGained: 2,
  })
})

test('데미지 난수와 크리티컬 경계가 공식에 맞는다', async () => {
  const { rollDamage } = await load('src/game/rules/stats.ts')
  const values = [0, 0.1199, 0.5, 0.12]
  let index = 0
  const rng = () => values[index++]

  assert.deepEqual(rollDamage({ baseAttack: 12, weaponAttack: 10, multiplier: 1 }, rng), {
    damage: 30,
    variance: 0.9,
    critical: true,
  })
  assert.deepEqual(rollDamage({ baseAttack: 12, weaponAttack: 10, multiplier: 1 }, rng), {
    damage: 22,
    variance: 1,
    critical: false,
  })
})

test('10,000회 데미지의 분산 범위와 크리티컬 비율이 검증 수치 안이다', async () => {
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const { rollDamage } = await load('src/game/rules/stats.ts')
  const rng = mulberry32(0x729f5ac5)
  let criticals = 0
  let minVariance = Infinity
  let maxVariance = -Infinity

  for (let index = 0; index < 10_000; index += 1) {
    const result = rollDamage({ baseAttack: 14, weaponAttack: 12, multiplier: 1.8 }, rng)
    criticals += Number(result.critical)
    minVariance = Math.min(minVariance, result.variance)
    maxVariance = Math.max(maxVariance, result.variance)
  }

  assert.ok(minVariance >= 0.9)
  assert.ok(maxVariance <= 1.1)
  assert.ok(criticals / 10_000 >= 0.11)
  assert.ok(criticals / 10_000 <= 0.13)
})
