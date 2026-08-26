import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { cameraIntroAt } = await import(pathToFileURL(join(ROOT, 'src/game/cameraIntro.ts')).href)

test('오프닝 카메라는 0/1.5/3초에 하늘→우듬지→플레이어를 향한다', () => {
  const player = { x: 2, y: 1.5, z: 20 }
  assert.deepEqual(cameraIntroAt(0, player), {
    pitchDeg: -28, target: { x: 38, y: 80, z: -96 }, handedOff: false,
  })
  assert.deepEqual(cameraIntroAt(1_500, player), {
    pitchDeg: -16, target: { x: 38, y: 50, z: -96 }, handedOff: false,
  })
  assert.deepEqual(cameraIntroAt(3_000, player), {
    pitchDeg: -4, target: player, handedOff: true,
  })
})

test('3초 이후는 FollowCamera 인계 자세에 고정된다', () => {
  const player = { x: -3, y: 2, z: 18 }
  assert.deepEqual(cameraIntroAt(9_000, player), cameraIntroAt(3_000, player))
})
