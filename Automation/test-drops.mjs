import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readMonsters = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/monsters.json'), 'utf8'))

test('돼지 데이터는 콘티의 전투·드롭 값을 보존한다', async () => {
  const monsters = await readMonsters()
  assert.deepEqual(monsters.pig, {
    id: 'pig',
    name: '돼지',
    level: 3,
    hp: 65,
    attack: 8,
    speed: 1.8,
    detectionRadius: 12, // 2026-08-27 a66a3f2: 6→12 선공
    respawnSeconds: 8,
    exp: 18,
    drops: {
      meso: { min: 10, max: 30 },
      items: [{ itemId: 'head.pig-ribbon', chance: 0.15, quantity: 1 }],
    },
  })
})

test('드롭 난수의 양 끝은 메소 10~30 정수와 리본 15% 경계를 따른다', async () => {
  const { rollDrops } = await load('src/game/rules/drops.ts')
  const monsters = await readMonsters()
  const values = [0, 0.1499, 0.999999, 0.15]
  let index = 0
  const rng = () => values[index++]

  assert.deepEqual(rollDrops(monsters.pig.drops, rng), {
    meso: 10,
    items: [{ itemId: 'head.pig-ribbon', quantity: 1 }],
  })
  assert.deepEqual(rollDrops(monsters.pig.drops, rng), { meso: 30, items: [] })
})

test('10,000회 표본의 메소 평균과 리본 비율이 §9-3 허용 범위다', async () => {
  const { rollDrops } = await load('src/game/rules/drops.ts')
  const { mulberry32 } = await load('src/game/rules/rng.ts')
  const monsters = await readMonsters()
  const rng = mulberry32(0x4d360710)
  let meso = 0
  let ribbons = 0

  for (let index = 0; index < 10_000; index += 1) {
    const drop = rollDrops(monsters.pig.drops, rng)
    meso += drop.meso
    ribbons += drop.items.length
  }

  assert.ok(Math.abs(meso / 10_000 - 20) <= 1)
  assert.ok(Math.abs(ribbons / 10_000 - 0.15) <= 0.01)
})
