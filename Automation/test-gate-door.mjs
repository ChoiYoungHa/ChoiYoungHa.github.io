import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('7m 진입 후 문은 0/0.5/1.0초에 0/87.5/100도로 ease-out 열린다', async () => {
  const { INITIAL_GATE_DOOR, advanceGateDoor } = await load('src/game/rules/gateDoor.ts')
  const at0 = advanceGateDoor(true, INITIAL_GATE_DOOR, 7, 0)
  const atHalf = advanceGateDoor(true, at0, 7, 0.5)
  const atOne = advanceGateDoor(true, atHalf, 7, 0.5)
  assert.deepEqual([at0.angleDeg, atHalf.angleDeg, atOne.angleDeg], [0, 87.5, 100])
})

test('7~12m 히스테리시스를 유지하고 12m 이탈 뒤 1초에 닫힌다', async () => {
  const { INITIAL_GATE_DOOR, advanceGateDoor } = await load('src/game/rules/gateDoor.ts')
  const opened = advanceGateDoor(true, INITIAL_GATE_DOOR, 6.9, 1)
  const held = advanceGateDoor(true, opened, 9, 1)
  const closing = advanceGateDoor(true, held, 12, 0.5)
  const closed = advanceGateDoor(true, closing, 12.1, 0.5)
  assert.deepEqual([opened.open, held.open, held.angleDeg], [true, true, 100])
  assert.equal(closing.open, false)
  assert.equal(closed.angleDeg, 0)
})

test('게이트 OFF에서는 규칙 step을 호출하지 않고 닫힌 상태를 반환한다', async () => {
  const { INITIAL_GATE_DOOR, advanceGateDoor } = await load('src/game/rules/gateDoor.ts')
  let calls = 0
  const result = advanceGateDoor(false, { open: true, progress: 1, angleDeg: 100 }, 0, 1, () => {
    calls += 1
    return INITIAL_GATE_DOOR
  })
  assert.equal(calls, 0)
  assert.deepEqual(result, INITIAL_GATE_DOOR)
})

test('아치 렌더는 게이트 안에서만 별도 문짝 노드와 프레임 훅을 마운트한다', async () => {
  const source = await readFile(join(ROOT, 'src/scene/village/Props.tsx'), 'utf8')
  assert.match(source, /wall_straight_gate_door_left/)
  assert.match(source, /wall_straight_gate_door_right/)
  assert.match(source, /GAME_INPUT_ENABLED\s*\?\s*<AnimatedArch/)
  assert.match(source, /useGateDoorMotion\(/)
})

test('GLB 문짝 원점은 각 문짝의 바깥 세로 모서리 힌지다', async () => {
  const bytes = await readFile(join(ROOT, 'public/models/prop_arch.glb'))
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().replace(/\0+$/, ''))
  const left = gltf.nodes.find((node) => node.name === 'wall_straight_gate_door_left')
  const right = gltf.nodes.find((node) => node.name === 'wall_straight_gate_door_right')
  const leftPosition = gltf.accessors[gltf.meshes[left.mesh].primitives[0].attributes.POSITION]
  const rightPosition = gltf.accessors[gltf.meshes[right.mesh].primitives[0].attributes.POSITION]
  assert.ok(Math.abs(left.translation[0] - 0.45) < 1e-4)
  assert.deepEqual(leftPosition.max[0], 0)
  assert.ok(Math.abs(right.translation[0] + 0.45) < 1e-4)
  assert.deepEqual(rightPosition.min[0], 0)
})
