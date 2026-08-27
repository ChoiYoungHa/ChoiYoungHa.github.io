import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('이름은 1~8자이며 모든 공백을 거부한다', async () => {
  const { validateCharacterName } = await load('src/systems/ui/characterCreateLogic.ts')
  assert.deepEqual(validateCharacterName(''), { valid: false, reason: 'empty' })
  assert.deepEqual(validateCharacterName('영 하'), { valid: false, reason: 'whitespace' })
  assert.deepEqual(validateCharacterName('123456789'), { valid: false, reason: 'too-long' })
  assert.deepEqual(validateCharacterName('영하'), { valid: true, reason: null })
})

test('직업 카드 4장은 데이터의 스탯·대표 스킬과 선택 밝기를 표시한다', async () => {
  const { characterCreatePresentation } = await load('src/systems/ui/characterCreateLogic.ts')
  const view = characterCreatePresentation('영하', 'archer', 'conti')
  assert.equal(view.jobs.length, 1) // 2026-08-27 영하님 결정: 전사 단일
  assert.deepEqual(view.jobs.map(({ id, color }) => [id, color]), [['warrior', '#e05a3a']] /* 2026-08-27 전사 단일 */)
  assert.deepEqual(view.jobs.find(({ id }) => id === 'warrior')?.startStats, { hp: 220, mp: 60, attack: 14 })
  assert.equal(view.jobs.find(({ id }) => id === 'warrior')?.skillName, '불꽃베기')
  assert.equal(view.jobs.find(({ id }) => id === 'warrior')?.intensity, 0.6)
  assert.ok(view.jobs.filter(({ id }) => id !== 'archer').every(({ intensity }) => intensity === 0.6))
  assert.equal(view.canConfirm, true)
})

test('파츠 인덱스는 양방향 순환하고 랜덤 선택은 seed로 재현된다', async () => {
  const { DEFAULT_PORTRAIT_SELECTION } = await load('src/game/portrait/compose.ts')
  const { cycleIndex, cyclePortraitPart, randomCharacterSelection } = await load('src/systems/ui/characterCreateLogic.ts')
  assert.equal(cycleIndex(0, -1, 5), 4)
  assert.equal(cycleIndex(4, 1, 5), 0)
  assert.equal(cyclePortraitPart(DEFAULT_PORTRAIT_SELECTION, 'faceId', -1).faceId, 'heart')
  assert.equal(cyclePortraitPart(DEFAULT_PORTRAIT_SELECTION, 'faceId', 1).faceId, 'square')
  assert.deepEqual(randomCharacterSelection(42, 'archer'), randomCharacterSelection(42, 'archer'))
  assert.equal(randomCharacterSelection(42, 'archer').outfitId, 'archer')
  assert.notDeepEqual(randomCharacterSelection(42, 'archer'), randomCharacterSelection(43, 'archer'))
})
