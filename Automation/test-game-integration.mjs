import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('bootstrap gates game mode and production debug/IP overrides', async () => {
  const { parseGameBootstrapConfig } = await load('src/game/bootstrap.ts')
  assert.deepEqual(
    parseGameBootstrapConfig('https://local.invalid/?scene=hunt&ip=conti'),
    { enabled: false, initialScene: null, ipMode: 'conti', bossAwake: false },
  )
  assert.deepEqual(
    parseGameBootstrapConfig('https://local.invalid/?game=1&scene=hunt&ip=conti'),
    { enabled: true, initialScene: 'hunt', ipMode: 'conti', bossAwake: false },
  )
  assert.deepEqual(
    parseGameBootstrapConfig('https://local.invalid/?game=1&scene=hunt&ip=conti', '', true),
    { enabled: true, initialScene: null, ipMode: 'own', bossAwake: false },
  )
})

test('frame bridge drains edges into enqueueInput and eases camera only once', async () => {
  const { createGameFrameBridge, readCameraDistanceMultiplier } = await load('src/game/bridge.ts')
  const { consumePlayerJump } = await load('src/game/runtimeSignals.ts')
  const enqueued = []
  let nowMs = 0
  let first = true
  const session = {
    getSnapshot: () => ({ activeDialogue: true, game: { scene: 'forest' } }),
    enqueueInput: (input) => enqueued.push(input),
    tick: ({ dtMs }) => {
      nowMs += dtMs
      const events = first ? [{ type: 'camera-ease-start' }] : []
      first = false
      return { snapshot: { nowMs, game: { scene: 'forest' } }, events }
    },
  }
  let edges = ['jump', 'attack']
  const input = { consumePressed: () => { const next = edges; edges = []; return next } }
  const bridge = createGameFrameBridge(session, input)
  bridge.tick({ dtMs: 16, playerPos: { x: 0, z: 0 }, playerYaw: 0, move: false, run: false })
  assert.deepEqual(enqueued, [{ confirm: true, attack: true }])
  assert.equal(consumePlayerJump(), false, '대화 중 Space는 confirm이며 물리 점프가 아니다')
  for (let index = 0; index < 40; index += 1) {
    bridge.tick({ dtMs: 50, playerPos: { x: 0, z: 0 }, playerYaw: 0, move: false, run: false })
  }
  assert.equal(readCameraDistanceMultiplier(), 1.5)
  bridge.dispose()
  assert.equal(readCameraDistanceMultiplier(), 1)
})

test('frame bridge requests one physical jump only in a world scene', async () => {
  const { createGameFrameBridge } = await load('src/game/bridge.ts')
  const { consumePlayerJump } = await load('src/game/runtimeSignals.ts')
  let edges = ['jump']
  let scene = 'title'
  const session = {
    getSnapshot: () => ({ activeDialogue: null, game: { scene } }),
    enqueueInput: () => undefined,
    tick: ({ dtMs }) => ({ snapshot: { nowMs: dtMs, game: { scene } }, events: [] }),
  }
  const bridge = createGameFrameBridge(session, {
    consumePressed: () => { const value = edges; edges = []; return value },
  })
  bridge.tick({ dtMs: 16, playerPos: { x: 0, z: 0 }, playerYaw: 0, move: false, run: false })
  assert.equal(consumePlayerJump(), false)
  scene = 'forest'
  edges = ['jump']
  bridge.tick({ dtMs: 16, playerPos: { x: 0, z: 0 }, playerYaw: 0, move: false, run: false })
  assert.equal(consumePlayerJump(), true)
  assert.equal(consumePlayerJump(), false)
  bridge.dispose()
})

test('projector maps clip-space center to Canvas pixels', async () => {
  const { PerspectiveCamera } = await import('three')
  const { createGameProjector } = await load('src/systems/ui/projector.ts')
  const camera = new PerspectiveCamera(55, 4 / 3, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  camera.updateProjectionMatrix()
  const project = createGameProjector(camera, { width: 800, height: 600 })
  assert.deepEqual(project({ x: 0, y: 0, z: 0 }), { x: 400, y: 300, visible: true })
  assert.equal(project({ x: 0, y: 0, z: 10 }).visible, false)
})

test('2026-08-28 frame bridge: 공격키를 누르고 있으면 매 프레임 attack 입력, 모션은 실제 fx-spawn 에만 맞춘다', async () => {
  const { createGameFrameBridge } = await load('src/game/bridge.ts')
  const { readPlayerAttackSeq, readPlayerSkillSeq, resetGameRuntimeSignals } = await load('src/game/runtimeSignals.ts')
  resetGameRuntimeSignals()
  const enqueued = []
  let events = []
  const session = {
    getSnapshot: () => ({ activeDialogue: null, game: { scene: 'hunt' } }),
    enqueueInput: (input) => enqueued.push(input),
    tick: ({ dtMs }) => ({ snapshot: { nowMs: dtMs, game: { scene: 'hunt' } }, events }),
  }
  let edges = []
  let held = true
  const bridge = createGameFrameBridge(session, {
    consumePressed: () => { const value = edges; edges = []; return value },
    isDown: (action) => action === 'attack' && held,
  })
  const frame = { dtMs: 16, playerPos: { x: 0, z: 0 }, playerYaw: 0, move: false, run: false }
  bridge.tick(frame)
  bridge.tick(frame)
  assert.deepEqual(enqueued, [{ attack: true }, { attack: true }], '키를 누르고 있으면 edge 없이도 attack 입력이 매 프레임 들어간다(쿨다운 판정은 세션)')
  assert.equal(readPlayerAttackSeq(), 0, '세션이 공격을 내보내기 전엔 모션도 없다(쿨다운 중 헛스윙 방지)')
  events = [{ type: 'fx-spawn', skillId: 'basic-attack' }, { type: 'fx-spawn', skillId: 'flame-slash' }]
  bridge.tick(frame)
  assert.equal(readPlayerAttackSeq(), 1)
  assert.equal(readPlayerSkillSeq(), 1)
  events = []
  held = false
  edges = ['skill']
  bridge.tick(frame)
  assert.deepEqual(enqueued.at(-1), { skill: true })
  assert.equal(readPlayerSkillSeq(), 1, '거부된(fx-spawn 없는) 스킬 입력은 모션을 내지 않는다')
  bridge.dispose()
})
