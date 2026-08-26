import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const parts = JSON.parse(await readFile(join(ROOT, 'src/game/data/portrait-parts.json'), 'utf8'))

test('원본 조합기의 9종 파츠와 팔레트 개수를 보존한다', () => {
  assert.deepEqual({
    faces: parts.faces.length,
    eyes: parts.eyes.length,
    noses: parts.noses.length,
    mouths: parts.mouths.length,
    hairs: parts.hairs.length,
    skinColors: parts.skinColors.length,
    hairColors: parts.hairColors.length,
    eyeColors: parts.eyeColors.length,
    outfits: parts.outfits.length,
  }, {
    faces: 5,
    eyes: 6,
    noses: 3,
    mouths: 4,
    hairs: 8,
    skinColors: 4,
    hairColors: 6,
    eyeColors: 6,
    outfits: 4,
  })
  assert.deepEqual(parts.skinColors.map((part) => part.value), [
    '#f4dcc0', '#e8c9a4', '#d0a173', '#a8764c',
  ])
  assert.deepEqual(parts.hairColors.map((part) => part.value), [
    '#2e241c', '#6b4a2a', '#d8b45e', '#b34a3a', '#4a5a7a', '#9b6bd6',
  ])
  assert.deepEqual(parts.eyeColors.map((part) => part.value), [
    '#4a3728', '#2e5c8a', '#3a7a4a', '#7a3a5c', '#5a4a8a', '#8a5a2a',
  ])
  for (const key of [
    'faces', 'eyes', 'noses', 'mouths', 'hairs',
    'skinColors', 'hairColors', 'eyeColors', 'outfits',
  ]) {
    const collection = parts[key]
    for (const part of collection) {
      assert.equal(typeof part.id, 'string')
      assert.equal(typeof part.name, 'string')
    }
  }
})

test('조합 결과는 고정 레이어 순서와 256 viewBox를 갖고 모든 fill 슬롯을 해소한다', async () => {
  const portrait = await load('src/game/portrait/compose.ts')
  const result = portrait.composePortrait(portrait.DEFAULT_PORTRAIT_SELECTION, parts)

  assert.equal(result.viewBox, '0 0 256 256')
  assert.deepEqual(
    [...new Set(result.layers.map((layer) => layer.id.split(':')[0]))],
    ['base', 'outfit', 'hair-back', 'face', 'eye', 'nose', 'mouth', 'hair-front'],
  )
  assert.equal(new Set(result.layers.map((layer) => layer.id)).size, result.layers.length)
  for (const layer of result.layers) {
    assert.ok(layer.d.length > 0)
    assert.ok(layer.fill.length > 0)
    assert.equal(layer.fill.startsWith('$'), false)
  }
})

test('같은 seed는 같은 선택을 만들고 모든 선택 id가 카탈로그에 존재한다', async () => {
  const portrait = await load('src/game/portrait/compose.ts')
  const first = portrait.randomSelection(85021)
  const second = portrait.randomSelection(85021)
  const other = portrait.randomSelection(85022)

  assert.deepEqual(second, first)
  assert.notDeepEqual(other, first)
  const mapping = {
    faceId: 'faces',
    eyeId: 'eyes',
    noseId: 'noses',
    mouthId: 'mouths',
    hairId: 'hairs',
    skinId: 'skinColors',
    hairColorId: 'hairColors',
    eyeColorId: 'eyeColors',
    outfitId: 'outfits',
  }
  for (const [selectionKey, collectionKey] of Object.entries(mapping)) {
    assert.ok(parts[collectionKey].some((part) => part.id === first[selectionKey]))
  }
})
