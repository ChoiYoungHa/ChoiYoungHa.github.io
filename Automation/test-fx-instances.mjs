import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

const fxEvent = (sequence, skillId, atMs = 1_000) => ({
  type: 'fx-spawn',
  sequence,
  atMs,
  skillId,
  position: { x: 10, z: 20 },
  playerYaw: 0,
  targetPosition: { x: 11, z: 18 },
  impactPosition: { x: 11, z: 18 },
  landingPosition: { x: 10, z: 17.5 },
})

test('fx-spawn becomes bounded atlas/color/frame/life instance records', async () => {
  const { createFxRenderState, stepFxRenderState, FX_INSTANCE_CAPACITY } = await load('src/scene/fx/fxInstances.ts')
  const anchors = { playerPosition: { x: 10, z: 20 }, playerYaw: 0, targetPositions: {} }
  const result = stepFxRenderState(createFxRenderState(), [fxEvent(1, 'flame-slash')], 1_080, anchors)

  assert.equal(FX_INSTANCE_CAPACITY, 30)
  assert.equal(result.instances.length, 2)
  assert.deepEqual(result.instances[0].uvRect, [0, 0, 0.25, 0.25])
  assert.equal(result.instances[0].frame, 0)
  assert.deepEqual(result.instances[0].color, [
    0.768151147247507,
    0.06847816984440017,
    0.024157632448504756,
  ])
  assert.equal(result.instances[0].life, 0.866667)
  assert.deepEqual(result.instances[0].position, { x: 10, y: 1.1, z: 18 })
  assert.deepEqual(result.instances[1].position, { x: 11, y: 1, z: 18 })

  const rainbow = stepFxRenderState(createFxRenderState(), [fxEvent(2, 'rainbow-shot')], 1_080, anchors)
  assert.equal(rainbow.instances.length, 10, 'five arrows and five ribbon layers share one draw')
})

test('player-front follows the gameplay yaw convention and basic attack stays visible for 0.6 seconds', async () => {
  const { createFxRenderState, stepFxRenderState } = await load('src/scene/fx/fxInstances.ts')
  const anchors = { playerPosition: { x: 10, z: 20 }, playerYaw: Math.PI / 2, targetPositions: {} }
  const front = stepFxRenderState(createFxRenderState(), [fxEvent(1, 'basic-attack')], 1_100, anchors)

  assert.equal(front.instances.length, 1)
  assert.deepEqual(front.instances[0].position, { x: 8, y: 1.1, z: 20 })
  assert.equal(front.instances[0].life > 0, true)
  assert.equal(stepFxRenderState(front.state, [], 1_599, anchors).instances.length, 1)
  assert.equal(stepFxRenderState(front.state, [], 1_650, anchors).instances.length, 0)

  const flame = stepFxRenderState(createFxRenderState(), [fxEvent(2, 'flame-slash')], 1_599, {
    playerPosition: { x: 10, z: 20 }, playerYaw: 0, targetPositions: {},
  })
  assert.equal(flame.instances.some(({ position }) => position.x === 10 && position.z === 18), true)
})

test('FX scale fade is local to each instance matrix, not a duplicated world-space center', async () => {
  const { createFxGeometry, writeFxAttributes } = await load('src/scene/fx/fxGeometry.ts')
  const geometry = createFxGeometry(1)
  assert.equal(geometry.getAttribute('center'), undefined)
  writeFxAttributes(geometry, [{
    uvRect: [0, 0, 0.25, 0.25], color: [1, 1, 1], frame: 0, life: 0.5,
    position: { x: 100, y: 1, z: -50 }, scale: [2, 2], billboard: 'full',
  }])
  assert.equal(geometry.getAttribute('life').getX(0), 0.5)
  geometry.dispose()
})

test('only the newest three FX events survive and emitted instances never exceed capacity', async () => {
  const { createFxRenderState, stepFxRenderState, FX_INSTANCE_CAPACITY } = await load('src/scene/fx/fxInstances.ts')
  const events = [
    fxEvent(1, 'flame-slash'),
    fxEvent(2, 'rainbow-shot'),
    fxEvent(3, 'ice-age'),
    fxEvent(4, 'leaping-slash'),
  ]
  const result = stepFxRenderState(createFxRenderState(), events, 1_400, {
    playerPosition: { x: 10, z: 20 }, playerYaw: 0, targetPositions: {},
  })

  assert.deepEqual(result.state.spawns.map(({ sequence }) => sequence), [2, 3, 4])
  assert.equal(result.instances.length <= FX_INSTANCE_CAPACITY, true)
})

test('life is a scale fade and level-up produces three staggered rings for 1.2 seconds', async () => {
  const {
    createFxRenderState,
    createLevelUpRenderState,
    stepFxRenderState,
    stepLevelUpRenderState,
  } = await load('src/scene/fx/fxInstances.ts')
  const anchors = { playerPosition: { x: 2, z: 3 }, playerYaw: 0, targetPositions: {} }
  const half = stepFxRenderState(createFxRenderState(), [fxEvent(1, 'flame-slash')], 1_300, anchors)
  assert.equal(half.instances[0].life, 0.5)

  const levelEvent = { type: 'level-up', sequence: 9, atMs: 2_000 }
  const rings = stepLevelUpRenderState(createLevelUpRenderState(), [levelEvent], 2_400, anchors.playerPosition)
  assert.equal(rings.instances.length, 3)
  assert.deepEqual(rings.instances.map(({ uvRect }) => uvRect), Array(3).fill([0.75, 0.75, 0.25, 0.25]))
  assert.deepEqual(rings.instances.map(({ frame }) => frame), [0, 0, 0])
  assert.equal(stepLevelUpRenderState(rings.state, [], 3_200, anchors.playerPosition).instances.length, 0)
})
