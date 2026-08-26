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
    character: { jobId: 'archer', name: '영하', faceParts: { faceId: 'heart', hairId: 'long', skinId: 'skin-deep', eyeId: 'sharp', noseId: 'bridge', mouthId: 'grin', hairColorId: 'hair-black', eyeColorId: 'eye-blue', outfitId: 'archer' } },
  })
  const forestTick = session.tick({ dtMs: 16, playerPos: { x: 0, z: 24 }, playerYaw: 0, inputs: {} })
  assert.equal(forestTick.snapshot.game.scene, 'forest')
  assert.equal(forestTick.snapshot.game.jobId, 'archer')
  assert.equal(forestTick.snapshot.game.name, '영하')
  assert.deepEqual(forestTick.snapshot.game.faceParts, { faceId: 'heart', hairId: 'long', skinId: 'skin-deep', eyeId: 'sharp', noseId: 'bridge', mouthId: 'grin', hairColorId: 'hair-black', eyeColorId: 'eye-blue', outfitId: 'archer' })

  const bound = useGame.getState()
  assert.equal(selectScene(bound), 'forest')
  assert.equal(selectQuestVisible(bound), false)
  assert.deepEqual(selectHudProps(bound).stats, {
    level: 1, name: '영하', hp: 160, maxHp: 160,
    mp: 80, maxMp: 80, exp: 0, expRequired: 15,
  })
})

test('debug initialScene enters through the session state machine and repairs prerequisites', async () => {
  const { createSession } = await load('src/game/session.ts')
  const hunt = createSession({ seed: 45, ipMode: 'own', initialScene: 'hunt' }).getSnapshot()
  assert.equal(hunt.game.scene, 'hunt')
  assert.equal(hunt.game.jobId, 'warrior')
  assert.equal(hunt.game.quest.status, 'active')
})

test('I-10 에필로그 액션은 에필로그 밖에서 스토리를 우회하지 못한다', async () => {
  const { createSession } = await load('src/game/session.ts')
  const session = createSession({ seed: 1, ipMode: 'own' })
  const result = session.tick({ dtMs: 16, playerPos: { x: 0, z: 24 }, playerYaw: 0, inputs: { epilogueAction: 'free' } })
  assert.equal(result.snapshot.game.scene, 'title')
  assert.deepEqual(result.events, [])
})

test('I-09 열린 대화는 월드 tick을 멈추고 close와 interact 동시 입력으로 재개방되지 않는다', async () => {
  const { createSession } = await load('src/game/session.ts')
  const session = createSession({ seed: 95, ipMode: 'own' })
  const tick = (playerPos, inputs = {}, dtMs = 16) => session.tick({ dtMs, playerPos, playerYaw: 0, inputs })
  tick({ x: 0, z: 24 }, { confirm: true })
  tick({ x: 0, z: 24 }, { confirm: true, character: { jobId: 'archer', name: '영하' } })
  tick({ x: -1.5, z: 20 })
  const stan = { x: -4.104056, z: 4.276014 }
  tick(stan, { interact: true })
  const hp = session.getSnapshot().game.hp
  const mob = session.getSnapshot().spawner.slots[0].mob
  for (let index = 0; index < 4; index += 1) tick(mob.position, {}, 1_000)
  assert.equal(session.getSnapshot().game.hp, hp)
  assert.notEqual(session.getSnapshot().zone, 'park')
  for (let index = 0; index < 3; index += 1) tick(stan, { confirm: true })
  tick(stan, { choice: 'decline' })
  const closed = tick(stan, { confirm: true, interact: true })
  assert.equal(closed.snapshot.activeDialogue, null)
  assert.deepEqual(closed.events.filter(({ type }) => type.startsWith('dialogue')).map(({ type }) => type), ['dialogue-close'])
})

test('I-01/I-03/I-11 스킬은 화상·동결을 세션에 적용하고 MP를 GameState/store까지 동기화한다', async () => {
  const { createSession } = await load('src/game/session.ts')
  const { useGame } = await load('src/store/useGame.ts')
  const start = (jobId, seed) => {
    const session = createSession({ seed, ipMode: 'own' })
    session.bind(useGame)
    const tick = (playerPos, inputs = {}, dtMs = 16) => session.tick({ dtMs, playerPos, playerYaw: 0, inputs })
    tick({ x: 0, z: 24 }, { confirm: true })
    tick({ x: 0, z: 24 }, { confirm: true, character: { jobId, name: '영하' } })
    const entered = tick({ x: -80, z: 8 })
    return { session, tick, target: entered.snapshot.spawner.slots[0].mob }
  }
  const warrior = start('warrior', 45)
  const warriorPos = { x: warrior.target.position.x, z: warrior.target.position.z + 1 }
  const cast = warrior.tick(warriorPos, { skill: true })
  const fx = cast.events.find(({ type }) => type === 'fx-spawn')
  assert.equal(fx?.skillId, 'flame-slash')
  assert.deepEqual(fx?.position, warriorPos)
  assert.equal(fx?.mobId, warrior.target.id)
  assert.equal(cast.snapshot.game.mp, 48)
  assert.equal(useGame.getState().mp, 48)
  let burnFloaters = cast.events.filter(({ type }) => type === 'floater').length
  for (let index = 0; index < 5; index += 1) burnFloaters += warrior.tick(warriorPos, {}, 600).events.filter(({ type }) => type === 'floater').length
  assert.ok(burnFloaters >= 6)

  const mage = start('mage', 46)
  const magePos = { x: mage.target.position.x, z: mage.target.position.z + 1 }
  const frozen = mage.tick(magePos, { skill: true })
  const frozenMob = frozen.snapshot.spawner.slots.find(({ id }) => id === mage.target.id).mob
  assert.ok(frozenMob.frozenUntilSeconds > frozen.snapshot.nowMs / 1000)
  assert.equal(frozen.snapshot.game.mp, 120)
})

test('I-11 skill-rejected 세션 이벤트는 쿨다운과 MP 부족 두 사유를 모두 구분한다', async () => {
  const { createSession } = await load('src/game/session.ts')
  const session = createSession({ seed: 47, ipMode: 'own' })
  const pos = { x: -119, z: 8 }
  const tick = (inputs = {}, dtMs = 16) => session.tick({ dtMs, playerPos: pos, playerYaw: 0, inputs })
  tick({ confirm: true })
  tick({ confirm: true, character: { jobId: 'mage', name: '영하' } })
  tick()
  tick({ skill: true })
  const cooldown = tick({ skill: true })
  assert.equal(cooldown.events.find(({ type }) => type === 'skill-rejected')?.reason, '쿨다운 중')
  for (let cast = 1; cast < 7; cast += 1) {
    const result = tick({ skill: true }, 5_000)
    if (result.snapshot.activeDialogue?.treeId === 'firstKill') tick({ confirm: true })
  }
  const noMp = tick({ skill: true }, 5_000)
  assert.equal(noMp.events.find(({ type }) => type === 'skill-rejected')?.reason, 'MP 부족')
  assert.equal(noMp.snapshot.game.mp, 0)
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
      assert.equal(killCredit, 1)
      if (result.snapshot.activeDialogue?.treeId === 'firstKill') tick(player, 0, { confirm: true })
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
  assert.ok(allEvents.some(({ type, dialogueId }) => type === 'dialogue-open' && dialogueId === 'firstKill'))

  let respawned = false
  let dyingInputsChecked = false
  for (let step = 0; step < 120 && !respawned; step += 1) {
    const live = session.getSnapshot().spawner.slots.find((slot) => slot.mob !== null && slot.mob.state !== 'dying')?.mob
    assert.notEqual(live, undefined)
    const result = tick({ x: live.position.x, z: live.position.z }, 0, {}, 500)
    if (!dyingInputsChecked && result.events.some(({ type }) => type === 'death')) {
      const blocked = tick({ x: live.position.x, z: live.position.z }, 0, { attack: true, skill: true }, 100)
      assert.equal(blocked.snapshot.respawnState.phase, 'dying')
      assert.equal(blocked.events.some(({ type }) => type === 'floater' || type === 'drop-collect'), false)
      dyingInputsChecked = true
    }
    respawned = result.events.some(({ type }) => type === 'respawn')
  }
  assert.equal(respawned, true)
  assert.equal(dyingInputsChecked, true)
  assert.equal(session.getSnapshot().game.hp, 80)
  assert.equal(session.getSnapshot().zone, null)
  assert.equal(session.getSnapshot().spawner.slots.some(({ mob }) => mob?.state === 'chase' || mob?.state === 'attack'), false)
  assert.ok(allEvents.some(({ type }) => type === 'death'))
  assert.ok(allEvents.some(({ type }) => type === 'clear-monster-aggro'))
  assert.ok(allEvents.every((event, index) => index === 0 || event.sequence > allEvents[index - 1].sequence))
})
