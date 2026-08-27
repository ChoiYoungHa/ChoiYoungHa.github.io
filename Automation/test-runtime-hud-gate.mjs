import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('디버그 HUD는 기본 경로에 유지되고 game에서는 ?hud=1일 때만 보인다', async () => {
  const { shouldShowRuntimeHud } = await load('src/systems/runtimeHudGate.ts')
  assert.equal(shouldShowRuntimeHud('', false), true)
  assert.equal(shouldShowRuntimeHud('?route=bench', false), true)
  assert.equal(shouldShowRuntimeHud('?game=1', true), false)
  assert.equal(shouldShowRuntimeHud('?game=1&hud=1', true), true)
  const app = await readFile(join(ROOT, 'src/App.tsx'), 'utf8')
  assert.match(app, /shouldShowRuntimeHud\(/)
})

test('?hud=1 카메라 거리는 게임 이징 배율을 반영한다', async () => {
  const source = await readFile(join(ROOT, 'src/systems/RuntimeHud.tsx'), 'utf8')
  assert.match(source, /readCameraDistanceMultiplier\(\)/)
  assert.match(source, /GAME_INPUT_ENABLED/)
})
