import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('title and character inputs advance one session while the bound store mirrors game state', async () => {
  const { createSession } = await load('src/game/session.ts')
  const { useGame, selectHudProps, selectQuestVisible, selectScene } = await load('src/store/useGame.ts')
  const session = createSession({ seed: 95, ipMode: 'own' })
  session.bind(useGame)

  session.enqueueInput({ confirm: true })
  const createTick = session.tick({ dtMs: 16, playerPos: { x: 0, z: 24 }, playerYaw: 0, inputs: {} })
  assert.equal(createTick.snapshot.game.scene, 'create')
  assert.deepEqual(createTick.events.map(({ type }) => type), ['scene'])

  session.enqueueInput({
    confirm: true,
    character: { jobId: 'archer', name: '영하' },
  })
  const forestTick = session.tick({ dtMs: 16, playerPos: { x: 0, z: 24 }, playerYaw: 0, inputs: {} })
  assert.equal(forestTick.snapshot.game.scene, 'forest')
  assert.equal(forestTick.snapshot.game.jobId, 'archer')
  assert.equal(forestTick.snapshot.game.name, '영하')

  const bound = useGame.getState()
  assert.equal(selectScene(bound), 'forest')
  assert.equal(selectQuestVisible(bound), false)
  assert.deepEqual(selectHudProps(bound).stats, {
    level: 1, name: '영하', hp: 160, maxHp: 160,
    mp: 80, maxMp: 80, exp: 0, expRequired: 15,
  })
})

test('gate, NPC dialogue, quest acceptance, and shop purchase share one ordered event stream', async () => {
  const { createSession } = await load('src/game/session.ts')
  const session = createSession({ seed: 95, ipMode: 'own' })
  const tick = (playerPos, playerYaw = 0, inputs = {}, dtMs = 16) => session.tick({ dtMs, playerPos, playerYaw, inputs })

  tick({ x: 0, z: 24 }, 0, { confirm: true })
  tick({ x: 0, z: 24 }, 0, { confirm: true, character: { jobId: 'archer', name: '영하' } })
  const gate = tick({ x: -1.5, z: 20 })
  assert.equal(gate.snapshot.game.scene, 'henesys')
  assert.deepEqual(
    gate.events.filter(({ type }) => type !== 'tutorial').map(({ type }) => type),
    ['banner', 'camera-ease-start', 'scene'],
  )
  assert.deepEqual(gate.snapshot.tutorialEvents, ['move', 'run'])

  const stan = { x: -4.104056, z: 4.276014 }
  const opened = tick(stan, 0, { interact: true })
  assert.equal(opened.snapshot.activeDialogue?.treeId, 'stan')
  assert.equal(opened.snapshot.game.scene, 'stan')
  for (let index = 0; index < 3; index += 1) tick(stan, 0, { confirm: true })
  tick(stan, 0, { choice: 'accept' })
  tick(stan, 0, { confirm: true })
  tick(stan, 0, { confirm: true })
  assert.equal(session.getSnapshot().game.quest.status, 'active')
  assert.equal(session.getSnapshot().activeDialogue, null)

  const maya = { x: -5.44966, z: 18.660593 }
  const mayaOpened = tick(maya, 0, { interact: true })
  assert.equal(mayaOpened.snapshot.activeDialogue?.treeId, 'maya')
  tick(maya, 0, { confirm: true })
  tick(maya, 0, { confirm: true })
  const shopOpened = tick(maya, 0, { confirm: true })
  assert.equal(shopOpened.snapshot.game.scene, 'shop')

  const purchased = tick(maya, 0, { confirm: true, selectedItemId: 'weapon.hunting-bow' })
  assert.equal(purchased.snapshot.game.meso, 600)
  assert.equal(purchased.snapshot.game.equipment.weapon, 'weapon.hunting-bow')
  assert.equal(purchased.snapshot.purchased, true)
  assert.ok(purchased.events.some(({ type }) => type === 'purchase'))
  assert.ok(purchased.events.every((event, index, events) => index === 0 || event.sequence > events[index - 1].sequence))
})

test('park ticks connect AI combat, drops, quest credit, death, and timed respawn', async () => {
  const { createSession } = await load('src/game/session.ts')
  const session = createSession({ seed: 45, ipMode: 'own' })
  const allEvents = []
  const tick = (playerPos, playerYaw = 0, inputs = {}, dtMs = 16) => {
    const result = session.tick({ dtMs, playerPos, playerYaw, inputs })
    allEvents.push(...result.events)
    return result
  }

  tick({ x: 0, z: 24 }, 0, { confirm: true })
  tick({ x: 0, z: 24 }, 0, { confirm: true, character: { jobId: 'archer', name: '영하' } })
  tick({ x: -1.5, z: 20 })
  const stan = { x: -4.104056, z: 4.276014 }
  tick(stan, 0, { interact: true })
  for (let index = 0; index < 3; index += 1) tick(stan, 0, { confirm: true })
  tick(stan, 0, { choice: 'accept' })
  tick(stan, 0, { confirm: true })
  tick(stan, 0, { confirm: true })
  const maya = { x: -5.44966, z: 18.660593 }
  tick(maya, 0, { interact: true })
  tick(maya, 0, { confirm: true })
  tick(maya, 0, { confirm: true })
  tick(maya, 0, { confirm: true })
  tick(maya, 0, { confirm: true, selectedItemId: 'weapon.hunting-bow' })

  const entered = tick({ x: -80, z: 8 })
  assert.equal(entered.snapshot.game.scene, 'hunt')
  assert.equal(entered.snapshot.spawner.slots.length, 8)

  let target = entered.snapshot.spawner.slots.find((slot) => slot.mob !== null).mob
  let killCredit = 0
  for (let step = 0; step < 30 && killCredit === 0; step += 1) {
    const player = { x: target.position.x, z: target.position.z + 1 }
    const result = tick(player, 0, step === 0 ? { skill: true } : { attack: true }, 650)
    target = result.snapshot.spawner.slots.find((slot) => slot.id === target.id).mob ?? target
    killCredit = result.snapshot.game.quest.killCount
    if (result.events.some(({ type }) => type === 'drop-spawn')) {
      const collected = tick({ x: target.position.x, z: target.position.z }, 0, {}, 500)
      killCredit = collected.snapshot.game.quest.killCount
    }
  }
  assert.equal(killCredit, 1)
  assert.equal(session.getSnapshot().game.level, 2)
  assert.equal(session.getSnapshot().game.exp, 3)
  assert.ok(allEvents.some(({ type }) => type === 'level-up'))
  assert.ok(allEvents.some(({ type }) => type === 'floater'))
  assert.ok(allEvents.some(({ type }) => type === 'drop-spawn'))
  assert.ok(allEvents.some(({ type }) => type === 'drop-collect'))

  let respawned = false
  for (let step = 0; step < 120 && !respawned; step += 1) {
    const live = session.getSnapshot().spawner.slots.find((slot) => slot.mob !== null && slot.mob.state !== 'dying')?.mob
    assert.notEqual(live, undefined)
    const result = tick({ x: live.position.x, z: live.position.z }, 0, {}, 500)
    respawned = result.events.some(({ type }) => type === 'respawn')
  }
  assert.equal(respawned, true)
  assert.equal(session.getSnapshot().game.hp, 80)
  assert.ok(allEvents.some(({ type }) => type === 'death'))
  assert.ok(allEvents.some(({ type }) => type === 'clear-monster-aggro'))
  assert.ok(allEvents.every((event, index) => index === 0 || event.sequence > allEvents[index - 1].sequence))
})
