import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('yaw 0/±π/2의 전방은 이동·전투·상호작용이 공유하는 -sin/-cos 규약이다', async () => {
  const { forwardFromYaw } = await load('src/player/input.ts')
  const cases = [
    [0, { x: 0, z: -1 }],
    [Math.PI / 2, { x: -1, z: 0 }],
    [-Math.PI / 2, { x: 1, z: 0 }],
  ]
  for (const [yaw, expected] of cases) {
    const actual = forwardFromYaw(yaw)
    assert.ok(Math.abs(actual.x - expected.x) < 1e-12, `yaw ${yaw} x`)
    assert.ok(Math.abs(actual.z - expected.z) < 1e-12, `yaw ${yaw} z`)
  }

  for (const relativePath of [
    'src/game/rules/combat.ts',
    'src/game/world/interact.ts',
    'src/player/controllers/raycast.ts',
  ]) {
    const source = await readFile(join(ROOT, relativePath), 'utf8')
    assert.match(source, /forwardFromYaw\(/, `${relativePath} must use the shared convention`)
  }
})

test('yaw +π/2 정면의 돼지는 기본 공격과 F 상호작용 모두 선택된다', async () => {
  const [{ resolveBasicAttack }, { findInteractable }] = await Promise.all([
    load('src/game/rules/combat.ts'),
    load('src/game/world/interact.ts'),
  ])
  const target = { id: 'pig-front', position: { x: -1, z: 0 } }
  const attack = resolveBasicAttack({
    origin: { x: 0, z: 0 }, yaw: Math.PI / 2,
    baseAttack: 10, weaponAttack: 0, targets: [target], rng: () => 0.5,
  })
  assert.equal(attack.hits[0]?.targetId, 'pig-front')
  assert.equal(findInteractable(
    { x: 0, z: 0 }, Math.PI / 2, [target], { range: 2.5, fovDeg: 90 },
  ), 'pig-front')
})

test('브라우저 story 러너에는 전투·NPC yaw 반전 우회가 없다', async () => {
  const source = await readFile(join(ROOT, 'Automation/game-walk.mjs'), 'utf8')
  assert.doesNotMatch(source, /aimToward|rule-yaw|yaw\s*\+\s*Math\.PI/)
})
