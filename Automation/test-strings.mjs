import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readStrings = async () => JSON.parse(await readFile(join(ROOT, 'src/game/data/strings.ko.json'), 'utf8'))

test('S02~S10 모든 장면에 콘티 문자열 키가 있다', async () => {
  const { conti } = await readStrings()
  for (let scene = 2; scene <= 10; scene += 1) {
    const prefix = `s${String(scene).padStart(2, '0')}.`
    assert.ok(Object.keys(conti).some((key) => key.startsWith(prefix)), `${prefix} 누락`)
  }
  assert.equal(conti['s04.dialogue.1'], '자네, 처음 보는 얼굴이군. 여행자인가?')
  assert.equal(conti['s10.teaser'], '다음 예고 — 서쪽 절벽 너머, 아무도 돌아오지 않은 숲.')
})

test('conti와 own 표는 동일 키셋이며 빈 번역이 없다', async () => {
  const strings = await readStrings()
  assert.deepEqual(Object.keys(strings.own), Object.keys(strings.conti))
  for (const table of Object.values(strings)) {
    assert.ok(Object.values(table).every((value) => typeof value === 'string' && value.length > 0))
  }
})

test('own 모드는 지정 IP 명칭 4개를 모두 치환한다', async () => {
  const { own } = await readStrings()
  const joined = Object.values(own).join('\n')
  for (const banned of ['헤네시스', '스탄', '메소', '돼지리본']) {
    assert.equal(joined.includes(banned), false, `${banned} 잔존`)
  }
  for (const replacement of ['버섯마을', '촌장 오릭', '코인', '분홍 리본']) {
    assert.equal(joined.includes(replacement), true, `${replacement} 누락`)
  }
})

test('i18n 공개 함수는 모드별 문자열을 반환하고 없는 키를 거절한다', async () => {
  const { getStrings, t } = await load('src/game/i18n.ts')
  assert.equal(t('s04.elder.name', 'conti'), '장로 스탄')
  assert.equal(t('s04.elder.name', 'own'), '촌장 오릭')
  assert.equal(Object.keys(getStrings('conti')).length, Object.keys(getStrings('own')).length)
  assert.throws(() => t('missing.key', 'own'), /missing translation/)
})
