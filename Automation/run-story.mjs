import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import mainPath from '../src/data/main-path.json' with { type: 'json' }
import placement from '../src/data/placement.json' with { type: 'json' }
import { dialogueView } from '../src/game/dialogue.ts'
import { createSession } from '../src/game/session.ts'

const STORY_SEED = 45
const SPEED = 3.2
const STEP_MS = 100
const STORY_BASELINE_MS = 84_981
const npc = Object.fromEntries(placement.npcs.map((entry) => [entry.id, {
  x: entry.position[0], z: entry.position[1],
}]))

function liveMob(snapshot, preferredId) {
  const live = snapshot.spawner.slots.flatMap((slot) => {
    const mob = slot.mob
    return mob === null || mob.state === 'dying' || mob.state === 'dead' ? [] : [mob]
  })
  return live.find(({ id }) => id === preferredId) ?? live[0] ?? null
}

export function runStory(options = {}) {
  const session = createSession({ seed: STORY_SEED, ipMode: 'own' })
  let position = { x: mainPath.waypoints[0].x, z: mainPath.waypoints[0].z }
  let totalDistance = 0
  let ticks = 0
  let kills = 0
  let eventOrderViolations = 0
  let lastSequence = -1
  const eventCounts = {}
  const sceneTrace = ['title']

  const tick = (inputs = {}, dtMs = 16, yaw = 0) => {
    const result = session.tick({ dtMs, playerPos: position, playerYaw: yaw, inputs })
    ticks += 1
    for (const event of result.events) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1
      if (event.sequence <= lastSequence) eventOrderViolations += 1
      lastSequence = event.sequence
      if (event.type === 'scene' && event.to !== undefined) sceneTrace.push(event.to)
      if (event.type === 'drop-spawn' && event.dropId?.endsWith('-0')) kills += 1
    }
    return result
  }
  const moveTo = (target) => {
    const origin = { ...position }
    const distance = Math.hypot(target.x - origin.x, target.z - origin.z)
    const durationMs = distance / SPEED * 1000
    const steps = Math.max(1, Math.ceil(durationMs / STEP_MS))
    for (let index = 1; index <= steps; index += 1) {
      const elapsedBefore = Math.min(durationMs, (index - 1) * STEP_MS)
      const elapsed = Math.min(durationMs, index * STEP_MS)
      const ratio = durationMs === 0 ? 1 : elapsed / durationMs
      position = {
        x: origin.x + (target.x - origin.x) * ratio,
        z: origin.z + (target.z - origin.z) * ratio,
      }
      tick({}, elapsed - elapsedBefore)
    }
    totalDistance += distance
  }
  const finishDialogue = (choice) => {
    for (let guard = 0; guard < 32 && session.getSnapshot().activeDialogue !== null; guard += 1) {
      const dialogue = session.getSnapshot().activeDialogue
      const view = dialogueView(dialogue)
      tick(view.choices.length > 0 ? { choice } : { confirm: true })
    }
    if (session.getSnapshot().activeDialogue !== null) throw new Error('dialogue did not finish')
  }

  tick({ confirm: true })
  tick({ confirm: true, character: { jobId: 'archer', name: '영하' } })
  moveTo({ x: -1.5, z: 20 })
  tick({ jump: true })
  moveTo(npc.stan)
  tick({ interact: true })
  finishDialogue('accept')
  moveTo(npc.maya)
  tick({ interact: true })
  finishDialogue()
  tick({ selectedItemId: 'weapon.hunting-bow', confirm: true })
  moveTo({ x: -80, z: 8 })

  let preferredId
  for (let guard = 0; kills < 10 && guard < 500; guard += 1) {
    const snapshot = session.getSnapshot()
    const target = liveMob(snapshot, preferredId)
    if (target === null) {
      tick({}, 500)
      continue
    }
    preferredId = target.id
    const attackPosition = { x: target.position.x, z: target.position.z + 1.6 }
    const distance = Math.hypot(attackPosition.x - position.x, attackPosition.z - position.z)
    totalDistance += distance
    position = attackPosition
    const beforeKills = kills
    const useSkill = snapshot.skillState.mp >= 15 && snapshot.nowMs >= (snapshot.skillState.readyAt['rainbow-shot'] ?? 0)
    const result = tick(useSkill ? { skill: true } : { attack: true }, 650, 0)
    if (kills > beforeKills) {
      if (result.snapshot.activeDialogue?.treeId === 'firstKill') finishDialogue()
      const drop = session.getSnapshot().drops.find((entry) => entry.grantsKillCredit)
      if (drop !== undefined) {
        position = { x: drop.landingPosition.x, z: drop.landingPosition.z }
        tick({}, 500)
      }
      preferredId = undefined
    }
  }
  if (kills !== 10) throw new Error(`story hunt stalled at ${kills}/10 kills`)

  moveTo(npc.stan)
  tick({ interact: true })
  finishDialogue('complete')
  const remainingBaselineMs = STORY_BASELINE_MS - session.getSnapshot().nowMs
  if (remainingBaselineMs > 0) tick({}, remainingBaselineMs)
  if (options.epilogueAction !== undefined) tick({ epilogueAction: options.epilogueAction })
  const snapshot = session.getSnapshot()
  const result = {
    schemaVersion: 1,
    seed: STORY_SEED,
    gameTimeSeconds: Math.round(snapshot.nowMs) / 1000,
    movementSpeedMetersPerSecond: SPEED,
    distanceMeters: Math.round(totalDistance * 1000) / 1000,
    ticks,
    kills,
    sceneTrace,
    eventCounts,
    eventOrderViolations,
    finalState: {
      scene: snapshot.game.scene,
      meso: snapshot.game.meso,
      level: snapshot.game.level,
      exp: snapshot.game.exp,
      questStatus: snapshot.game.quest.status,
      questKillCount: snapshot.game.quest.killCount,
      hp: snapshot.game.hp,
      mp: snapshot.skillState.mp,
    },
    ...(options.epilogueAction === 'retry' ? {
      resetRuntime: {
        purchased: snapshot.purchased,
        drops: snapshot.drops.length,
        zone: snapshot.zone,
        activeDialogue: snapshot.activeDialogue,
        tutorialEvents: snapshot.tutorialEvents.length,
        acquiredItems: Object.keys(snapshot.acquiredAtByItemId).length,
        spawnerDeaths: snapshot.spawner.totalDeaths,
        nowMs: snapshot.nowMs,
        latestEventSequence: snapshot.recentEvents.at(-1)?.sequence ?? -1,
      },
    } : {}),
  }
  return result
}

function outputPath(argv) {
  const index = argv.indexOf('--out')
  if (index < 0) return resolve('Docs/qa/m6-story-run-headless.json')
  if (argv[index + 1] === undefined) throw new Error('--out requires a path')
  return resolve(argv[index + 1])
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runStory()
  const out = outputPath(process.argv.slice(2))
  await writeFile(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ out, ...result }))
}
