import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import items from '../src/game/data/items.json' with { type: 'json' }
import monsters from '../src/game/data/monsters.json' with { type: 'json' }
import quests from '../src/game/data/quests.json' with { type: 'json' }
import skills from '../src/game/data/skills.json' with { type: 'json' }
import { advance, createDialogue, dialogueView } from '../src/game/dialogue.ts'
import { enter } from '../src/game/flow.ts'
import { damageSpawnerMob, createSpawner, stepSpawner } from '../src/game/mobs/spawner.ts'
import { reduce } from '../src/game/reducers.ts'
import { resolveBasicAttack, resolveSkillAttack, applyMonsterHit } from '../src/game/rules/combat.ts'
import { inventoryQuantity } from '../src/game/rules/inventory.ts'
import { collectDrop, createDropEntities } from '../src/game/rules/pickup.ts'
import { beginDeath, stepRespawn } from '../src/game/rules/respawn.ts'
import { mulberry32 } from '../src/game/rules/rng.ts'
import { createSkillState, tryCastSkill } from '../src/game/rules/skills.ts'
import { createInitialState } from '../src/game/state.ts'

const STORY_SEED = 45
const pig = monsters.pig
const pigQuest = quests['pig-cleanup']
const bow = items.find((item) => item.id === 'weapon.hunting-bow')
const rainbowShot = skills['rainbow-shot']

if (bow === undefined) throw new Error('hunting bow is missing')

function playDialogue(game, treeId, context, choiceId) {
  let dialogue = createDialogue(treeId, context)
  for (let guard = 0; guard < 30 && !dialogue.finished; guard += 1) {
    const view = dialogueView(dialogue)
    const result = view.choices.length > 0
      ? advance(dialogue, choiceId)
      : advance(dialogue)
    dialogue = result.state
    for (const action of result.actions) game = reduce(game, action)
  }
  if (!dialogue.finished) throw new Error(`${treeId} dialogue did not finish`)
  return game
}

function activeMob(spawner) {
  return spawner.slots.find((slot) => (
    slot.mob !== null && slot.mob.state !== 'dying' && slot.mob.state !== 'dead'
  ))?.mob ?? null
}

function mobById(spawner, mobId) {
  return spawner.slots.find((slot) => slot.mob?.id === mobId)?.mob ?? null
}

export function runStorySimulation() {
  const sceneTrace = ['title']
  let nowSeconds = 0
  let game = createInitialState(null, '여행자')

  function transition(scene, durationSeconds) {
    game = enter(scene, game)
    sceneTrace.push(game.scene)
    nowSeconds += durationSeconds
  }

  transition('create', 1)
  game = reduce(game, { type: 'select-job', jobId: 'archer', name: '여행자' })
  transition('forest', 45)
  playDialogue(game, 's02', { questStatus: game.quest.status, purchased: false })
  transition('henesys', 4)
  transition('stan', 3)
  game = playDialogue(game, 'stan', {
    questStatus: game.quest.status,
    purchased: false,
  }, 'accept')
  transition('shop', 4)
  playDialogue(game, 'maya', { questStatus: game.quest.status, purchased: false })
  game = reduce(game, { type: 'purchase', item: bow })
  transition('park', 12)
  transition('hunt', 0)

  const aiRng = mulberry32(0x830030)
  const combatRng = mulberry32(0x831031)
  const dropRng = mulberry32(STORY_SEED)
  let spawner = createSpawner(aiRng)
  let skillState = createSkillState(game.mp)
  let playerCombat = { hp: game.hp, invulnerableUntilSeconds: 0 }
  const skillCastTimesSeconds = []
  let skillCooldownRejections = 0
  let skillMpRejections = 0
  let kills = 0
  let dropMeso = 0
  let ribbonDrops = 0
  let combatHits = 0
  let pickups = 0
  let aiSteps = 0
  let deathCount = 0
  let respawnChecks = 0
  let maxConcurrent = spawner.slots.filter((slot) => slot.mob !== null).length

  while (kills < 10) {
    let target = activeMob(spawner)
    while (target === null) {
      nowSeconds += 1 / 60
      spawner = stepSpawner(spawner, {
        dtSeconds: 1 / 60,
        nowSeconds,
        playerPosition: { x: 1000, z: 1000 },
      }, aiRng).state
      aiSteps += 1
      target = activeMob(spawner)
    }

    const targetId = target.id
    for (let step = 0; step < 3; step += 1) {
      nowSeconds += 1 / 60
      const stepped = stepSpawner(spawner, {
        dtSeconds: 1 / 60,
        nowSeconds,
        playerPosition: target.position,
      }, aiRng)
      spawner = stepped.state
      aiSteps += 1
      const attacks = stepped.events.filter((event) => (
        event.type === 'attack' && event.mobId === targetId
      ))
      for (const attack of attacks) {
        const hit = applyMonsterHit(playerCombat, {
          damage: attack.damage,
          nowSeconds,
        })
        playerCombat = hit.state
        const respawnState = {
          phase: 'alive',
          hp: playerCombat.hp,
          maxHp: game.maxHp,
          mp: skillState.mp,
          meso: game.meso,
          position: target.position,
          dyingUntilSeconds: null,
        }
        const started = beginDeath(respawnState, nowSeconds)
        const checked = stepRespawn(started.state, nowSeconds)
        respawnChecks += 1
        if (started.events.length > 0) deathCount += 1
        if (checked.events.some((event) => event.type === 'respawn')) {
          playerCombat = { hp: checked.state.hp, invulnerableUntilSeconds: 0 }
        }
      }
    }

    target = mobById(spawner, targetId)
    if (target === null) continue

    const cast = tryCastSkill(skillState, rainbowShot, nowSeconds * 1000)
    if (cast.ok) {
      skillState = cast.state
      skillCastTimesSeconds.push(nowSeconds)
      const attack = resolveSkillAttack({
        skillId: 'rainbow-shot',
        origin: { x: 0, z: 0 },
        yaw: 0,
        baseAttack: 12,
        weaponAttack: 10,
        targets: [{ id: targetId, position: { x: 0, z: -1 } }],
        rng: combatRng,
      })
      for (const hit of attack.hits) {
        spawner = damageSpawnerMob(spawner, hit.targetId, hit.damage, nowSeconds)
        combatHits += 1
      }
    } else if (cast.reason === '쿨다운 중') {
      skillCooldownRejections += 1
    } else {
      skillMpRejections += 1
    }

    while ((target = mobById(spawner, targetId)) !== null && target.hp > 0) {
      nowSeconds += 0.6
      const attack = resolveBasicAttack({
        origin: { x: 0, z: 0 },
        yaw: 0,
        baseAttack: 12,
        weaponAttack: 10,
        targets: [{ id: targetId, position: { x: 0, z: -1 } }],
        rng: combatRng,
      })
      const hit = attack.hits[0]
      if (hit === undefined) throw new Error('basic attack missed the story target')
      spawner = damageSpawnerMob(spawner, hit.targetId, hit.damage, nowSeconds)
      combatHits += 1
    }

    kills += 1
    game = reduce(game, { type: 'gain-exp', amount: pig.exp })
    const entities = createDropEntities(
      pig.drops,
      { x: target?.position.x ?? 0, y: 0, z: target?.position.z ?? 0 },
      nowSeconds,
      dropRng,
      { sequence: kills, sourceMonsterId: pig.id },
    )
    nowSeconds += 0.4
    for (const entity of entities) {
      if (entity.payload.kind === 'meso') dropMeso += entity.payload.amount
      else if (entity.payload.itemId === 'head.pig-ribbon') ribbonDrops += entity.payload.quantity
      const collected = collectDrop(
        game,
        entity,
        pigQuest,
        entity.landingPosition,
        nowSeconds,
      )
      if (!collected.collected) throw new Error(`story drop was not collectible: ${entity.id}`)
      game = collected.state
      pickups += 1
    }

    nowSeconds += 0.61
    const despawned = stepSpawner(spawner, {
      dtSeconds: 0.61,
      nowSeconds,
      playerPosition: { x: 1000, z: 1000 },
    }, aiRng)
    spawner = despawned.state
    aiSteps += 1
    maxConcurrent = Math.max(
      maxConcurrent,
      spawner.slots.filter((slot) => slot.mob !== null).length,
    )
  }

  transition('complete', 5)
  game = playDialogue(game, 'stan', {
    questStatus: game.quest.status,
    purchased: true,
  }, 'complete')
  transition('epilogue', 3)
  playDialogue(game, 's10', { questStatus: game.quest.status, purchased: true })

  return {
    schemaVersion: 1,
    seed: STORY_SEED,
    simulatedSeconds: Math.round(nowSeconds * 1000) / 1000,
    sceneTrace,
    kills,
    dropMeso,
    ribbonDrops,
    pickups,
    combatHits,
    aiSteps,
    deathCount,
    respawnChecks,
    skillCastTimesSeconds: skillCastTimesSeconds.map((value) => Math.round(value * 1000) / 1000),
    skillCooldownRejections,
    skillMpRejections,
    finalSkillMp: skillState.mp,
    playerHp: playerCombat.hp,
    finalMeso: game.meso,
    level: game.level,
    exp: game.exp,
    questStatus: game.quest.status,
    questKillCount: game.quest.killCount,
    inventoryRibbon: inventoryQuantity(game.inventory, 'head.pig-ribbon'),
    spawner: {
      totalSpawned: spawner.totalSpawned,
      totalDeaths: spawner.totalDeaths,
      maxConcurrent,
    },
  }
}

function outputPath(argv) {
  const index = argv.indexOf('--out')
  if (index < 0) return resolve('Docs/qa/m6-story-sim.json')
  if (argv[index + 1] === undefined) throw new Error('--out requires a path')
  return resolve(argv[index + 1])
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runStorySimulation()
  const path = outputPath(process.argv.slice(2))
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ out: path, ...result }))
}
