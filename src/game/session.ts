import itemData from './data/items.json' with { type: 'json' }
import jobData from './data/jobs.json' with { type: 'json' }
import monsterData from './data/monsters.json' with { type: 'json' }
import questData from './data/quests.json' with { type: 'json' }
import skillData from './data/skills.json' with { type: 'json' }
import placementData from '../data/placement.json' with { type: 'json' }
import zoneData from './data/zones.json' with { type: 'json' }
import { advance, createDialogue, type DialogueId, type DialogueState } from './dialogue.ts'
import { enter } from './flow.ts'
import { clearSpawnerAggro, createSpawner, damageSpawnerMob, stepSpawner, type SpawnerState } from './mobs/spawner.ts'
import { reduce, type GameAction } from './reducers.ts'
import { applyMonsterHit, applyTimedMobEffect, leapDestination, resolveBasicAttack, resolveEquipmentCombatModifiers, resolveSkillAttack, type CombatHit, type PlayerCombatState, type SkillId } from './rules/combat.ts'
import type { DropTable } from './rules/drops.ts'
import type { ItemDefinition } from './rules/inventory.ts'
import { equipInventoryItem } from './rules/inventory.ts'
import { addDropToCollection, collectDrop, createDropCollection, createDropEntities, dropCollectionValues, removeDropFromCollection, type DropCollection, type DropEntity } from './rules/pickup.ts'
import type { QuestDefinition } from './rules/quest.ts'
import { beginDeath, stepRespawn, type RespawnState } from './rules/respawn.ts'
import { mulberry32 } from './rules/rng.ts'
import { createSkillState, tryCastSkill, type SkillDefinition, type SkillState } from './rules/skills.ts'
import { createInitialState, type FaceParts, type GameScene, type GameState, type JobId } from './state.ts'
import { resolveIpMode, type IpMode } from './i18n.ts'
import type { TutorialInputEvent } from './tutorial.ts'
import { findInteractable } from './world/interact.ts'
import { step as stepZone, type ZoneId, type ZoneStepState } from './world/zones.ts'

export interface SessionPosition {
  x: number
  y?: number
  z: number
}

export interface SessionCharacterInput {
  jobId: JobId
  name: string
  faceParts?: Partial<FaceParts>
}

export interface SessionInputs {
  move?: boolean
  run?: boolean
  jump?: boolean
  interact?: boolean
  attack?: boolean
  skill?: boolean
  inventory?: boolean
  confirm?: boolean
  choice?: string
  character?: SessionCharacterInput
  selectedItemId?: string
  equipItemId?: string
  closeReward?: boolean
  epilogueAction?: 'retry' | 'free'
}

export interface SessionTickInput {
  dtMs: number
  playerPos: SessionPosition
  playerYaw: number
  inputs: SessionInputs
}

export type SessionEventType =
  | 'scene'
  | 'banner'
  | 'camera-ease-start'
  | 'dialogue-open'
  | 'dialogue-close'
  | 'purchase'
  | 'floater'
  | 'drop-spawn'
  | 'drop-collect'
  | 'level-up'
  | 'death'
  | 'respawn'
  | 'clear-monster-aggro'
  | 'skill-rejected'
  | 'reward'
  | 'tutorial'

export interface SessionEvent {
  type: SessionEventType
  atMs: number
  sequence: number
  from?: GameState['scene']
  to?: GameState['scene']
  zone?: ZoneId
  dialogueId?: DialogueId
  itemId?: string
  mobId?: string
  dropId?: string
  damage?: number
  critical?: boolean
  position?: SessionPosition
  previousLevel?: number
  currentLevel?: number
  reason?: string
  tutorialInput?: TutorialInputEvent
}

export interface SessionReward {
  previousLevel: number
  currentLevel: number
  shownAtMs: number
}

export interface SessionSnapshot {
  game: GameState
  nowMs: number
  playerPos: SessionPosition
  playerYaw: number
  zone: ZoneId | null
  activeDialogue: DialogueState | null
  purchased: boolean
  inventoryOpen: boolean
  selectedShopItemId: string | null
  spawner: SpawnerState
  drops: readonly DropEntity[]
  skillState: SkillState
  respawnState: RespawnState
  tutorialEvents: readonly TutorialInputEvent[]
  banner: { zone: 'village' | 'park', startedAtMs: number } | null
  reward: SessionReward | null
  epilogueStartedAtMs: number | null
  acquiredAtByItemId: Readonly<Record<string, number>>
  recentEvents: readonly SessionEvent[]
}

export interface SessionTickResult {
  snapshot: SessionSnapshot
  events: SessionEvent[]
}

export interface SessionStoreBinding {
  getState(): GameState & { dispatch(action: GameAction): void }
  setState(state: Partial<GameState>): void
}

export interface GameSession {
  getSnapshot(): SessionSnapshot
  subscribe(listener: () => void): () => void
  bind(store: SessionStoreBinding): () => void
  enqueueInput(inputs: SessionInputs): void
  tick(input: SessionTickInput): SessionTickResult
}

export interface CreateSessionOptions {
  seed: number
  ipMode: IpMode
  initialScene?: GameScene
}

function mergeInputs(queue: readonly SessionInputs[], direct: SessionInputs): SessionInputs {
  return Object.assign({}, ...queue, direct) as SessionInputs
}

interface PlacementNpc {
  id: string
  position: [number, number]
}

interface GateTrigger {
  center: { x: number, z: number }
  halfExtents: { x: number, z: number }
}

interface JobDefinition {
  baseAttack: number
  skillId: SkillId
  basicAttack: { cooldownMs: number }
}

interface BurnState {
  mobId: string
  damagePerTick: number
  remainingTicks: number
  nextTickAtMs: number
  intervalMs: number
}

interface MonsterDefinition {
  id: string
  exp: number
  drops: DropTable
}

const NPCS = (placementData.npcs as unknown as PlacementNpc[]).map((npc) => ({
  id: npc.id,
  position: { x: npc.position[0], z: npc.position[1] },
}))
const GATE = zoneData.triggers.villageGate as GateTrigger
const ITEMS = itemData as unknown as ItemDefinition[]
const JOBS = jobData as unknown as Record<JobId, JobDefinition>
const SKILLS = skillData as unknown as Record<SkillId, SkillDefinition>
const PIG = (monsterData as unknown as { pig: MonsterDefinition }).pig
const PIG_QUEST = (questData as unknown as Record<string, QuestDefinition>)['pig-cleanup']

function inGate(position: SessionPosition): boolean {
  return Math.abs(position.x - GATE.center.x) <= GATE.halfExtents.x
    && Math.abs(position.z - GATE.center.z) <= GATE.halfExtents.z
}

export function createSession(options: CreateSessionOptions): GameSession {
  const sessionIpMode = resolveIpMode(options.ipMode)
  let game: GameState = { ...createInitialState(null, ''), ipMode: sessionIpMode }
  if (options.initialScene !== undefined) game = enter(options.initialScene, game)
  let nowMs = 0
  let playerPos: SessionPosition = { x: 0, z: 24 }
  let playerYaw = 0
  let sequence = 0
  let zoneState: ZoneStepState = { zone: null }
  let gateInside = false
  let activeDialogue: DialogueState | null = null
  let purchased = false
  let inventoryOpen = false
  let selectedShopItemId: string | null = null
  let aiRng = mulberry32(options.seed ^ 0x6030)
  let combatRng = mulberry32(options.seed ^ 0x6031)
  let dropRng = mulberry32(options.seed)
  let spawner = createSpawner(aiRng)
  let dropCollection: DropCollection = createDropCollection()
  let drops: DropEntity[] = []
  let burns: BurnState[] = []
  let dropSequence = 0
  let skillState = createSkillState(game.mp)
  let basicReadyAtMs = 0
  let playerCombat: PlayerCombatState = { hp: game.hp, invulnerableUntilSeconds: 0 }
  let respawnState: RespawnState = {
    phase: 'alive',
    hp: game.hp,
    maxHp: game.maxHp,
    mp: game.mp,
    meso: game.meso,
    position: { x: playerPos.x, z: playerPos.z },
    dyingUntilSeconds: null,
  }
  let binding: SessionStoreBinding | null = null
  let queuedInputs: SessionInputs[] = []
  let tutorialEvents: TutorialInputEvent[] = []
  let previousPlayerPos: SessionPosition = { ...playerPos }
  let banner: SessionSnapshot['banner'] = null
  let reward: SessionReward | null = null
  let epilogueStartedAtMs: number | null = null
  let acquiredAtByItemId: Record<string, number> = {}
  let recentEvents: SessionEvent[] = []
  const listeners = new Set<() => void>()

  const snapshot = (): SessionSnapshot => ({
    game,
    nowMs,
    playerPos,
    playerYaw,
    zone: zoneState.zone,
    activeDialogue,
    purchased,
    inventoryOpen,
    selectedShopItemId,
    spawner,
    drops,
    skillState,
    respawnState,
    tutorialEvents,
    banner,
    reward,
    epilogueStartedAtMs,
    acquiredAtByItemId,
    recentEvents,
  })
  const notify = () => listeners.forEach((listener) => listener())
  const dispatch = (action: GameAction) => {
    game = reduce(game, action)
    binding?.getState().dispatch(action)
  }
  const emit = (events: SessionEvent[], event: Omit<SessionEvent, 'atMs' | 'sequence'>) => {
    const complete = { ...event, atMs: nowMs, sequence: sequence++ }
    events.push(complete)
    recentEvents = [...recentEvents, complete].slice(-128)
  }
  const changeScene = (scene: GameState['scene'], events: SessionEvent[]) => {
    const from = game.scene
    game = enter(scene, game)
    if (game.scene === from) return
    binding?.getState().dispatch({ type: 'scene-transition', scene: game.scene })
    emit(events, { type: 'scene', from, to: game.scene })
  }
  const mobById = (mobId: string) => spawner.slots.find((slot) => slot.mob?.id === mobId)?.mob ?? null
  const weaponAttack = () => {
    const weaponId = game.equipment.weapon
    if (weaponId === null) return 0
    const bonuses = ITEMS.find((item) => item.id === weaponId)?.bonuses ?? {}
    return bonuses.attack ?? bonuses.magic ?? 0
  }
  const weaponBonuses = () => {
    const weaponId = game.equipment.weapon
    return weaponId === null ? {} : (ITEMS.find((item) => item.id === weaponId)?.bonuses ?? {})
  }
  const applyCombatHits = (hits: readonly CombatHit[], events: SessionEvent[]) => {
    for (const hit of hits) {
      const before = mobById(hit.targetId)
      if (before === null || before.hp <= 0) continue
      spawner = damageSpawnerMob(spawner, hit.targetId, hit.damage, nowMs / 1000)
      emit(events, {
        type: 'floater',
        mobId: hit.targetId,
        damage: hit.damage,
        critical: hit.critical,
        position: { ...before.position },
      })
      const after = mobById(hit.targetId)
      if (after === null || after.hp > 0 || before.hp <= 0) continue

      const previousLevel = game.level
      dispatch({ type: 'gain-exp', amount: PIG.exp })
      const previousKillCount = game.quest.killCount
      dispatch({ type: 'quest-kill', quest: PIG_QUEST, monsterId: PIG.id })
      if (game.level > previousLevel) {
        emit(events, { type: 'level-up', previousLevel, currentLevel: game.level })
      }
      dropSequence += 1
      const spawned = createDropEntities(
        PIG.drops,
        { x: before.position.x, y: 0, z: before.position.z },
        nowMs / 1000,
        dropRng,
        { sequence: dropSequence, sourceMonsterId: PIG.id },
      )
      for (const drop of spawned) {
        dropCollection = addDropToCollection(dropCollection, drop, nowMs + dropSequence / 100).collection
      }
      drops = dropCollectionValues(dropCollection)
      spawned.forEach((drop) => emit(events, {
        type: 'drop-spawn',
        dropId: drop.id,
        position: { ...drop.landingPosition },
      }))
      if (previousKillCount === 0 && game.quest.killCount === 1 && activeDialogue === null) {
        activeDialogue = createDialogue('firstKill', { questStatus: game.quest.status, purchased })
        emit(events, { type: 'dialogue-open', dialogueId: 'firstKill' })
      }
    }
  }

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    bind(store) {
      binding = store
      store.setState(game)
      return () => {
        if (binding === store) binding = null
      }
    },
    enqueueInput(inputs) {
      queuedInputs.push(inputs)
    },
    tick(input) {
      if (!Number.isFinite(input.dtMs) || input.dtMs < 0) throw new RangeError('dtMs must be non-negative')
      nowMs += input.dtMs
      previousPlayerPos = playerPos
      playerPos = { ...input.playerPos }
      playerYaw = input.playerYaw
      const inputs = mergeInputs(queuedInputs, input.inputs)
      queuedInputs = []
      const events: SessionEvent[] = []
      let dialogueHandled = false
      const dialogueOpenAtTickStart = activeDialogue !== null

      if (banner !== null && nowMs - banner.startedAtMs >= 4_000) banner = null
      if (inputs.closeReward) reward = null
      if (game.scene === 'epilogue' && inputs.epilogueAction === 'free') changeScene('free', events)
      if (game.scene === 'epilogue' && inputs.epilogueAction === 'retry') {
        game = { ...createInitialState(null, ''), ipMode: sessionIpMode }
        binding?.setState(game)
        nowMs = 0
        sequence = 0
        aiRng = mulberry32(options.seed ^ 0x6030)
        combatRng = mulberry32(options.seed ^ 0x6031)
        dropRng = mulberry32(options.seed)
        playerPos = { x: 0, z: 24 }
        previousPlayerPos = { ...playerPos }
        playerYaw = 0
        zoneState = { zone: null }
        gateInside = false
        activeDialogue = null
        purchased = false
        inventoryOpen = false
        selectedShopItemId = null
        spawner = createSpawner(aiRng)
        dropCollection = createDropCollection()
        drops = []
        burns = []
        dropSequence = 0
        skillState = createSkillState(0)
        basicReadyAtMs = 0
        playerCombat = { hp: 0, invulnerableUntilSeconds: 0 }
        respawnState = {
          phase: 'alive', hp: 0, maxHp: 0, mp: 0, meso: game.meso,
          position: { ...playerPos }, dyingUntilSeconds: null,
        }
        reward = null
        epilogueStartedAtMs = null
        tutorialEvents = []
        banner = null
        acquiredAtByItemId = {}
        recentEvents = []
        emit(events, { type: 'scene', from: 'epilogue', to: 'title' })
      }

      if (game.scene === 'title' && inputs.confirm) {
        changeScene('create', events)
      } else if (game.scene === 'create' && inputs.confirm && inputs.character !== undefined) {
        dispatch({ type: 'select-job', ...inputs.character })
        skillState = createSkillState(game.mp)
        playerCombat = { hp: game.hp, invulnerableUntilSeconds: 0 }
        respawnState = {
          ...respawnState,
          hp: game.hp,
          maxHp: game.maxHp,
          mp: game.mp,
          meso: game.meso,
          position: { x: playerPos.x, z: playerPos.z },
        }
        changeScene('forest', events)
      }

      if (game.scene !== 'title' && game.scene !== 'create' && !dialogueOpenAtTickStart) {
        const moved = Math.hypot(playerPos.x - previousPlayerPos.x, playerPos.z - previousPlayerPos.z)
        const speed = input.dtMs <= 0 ? 0 : moved / (input.dtMs / 1000)
        const tutorialCandidates: TutorialInputEvent[] = [
          ...(inputs.move || moved > 0.01 ? ['move' as const] : []),
          ...(inputs.run || speed >= 3 ? ['run' as const] : []),
          ...(inputs.jump ? ['jump' as const] : []),
        ]
        for (const candidate of tutorialCandidates) {
          const expected = (['move', 'run', 'jump'] as const)[tutorialEvents.length]
          if (candidate !== expected) continue
          tutorialEvents = [...tutorialEvents, candidate]
          emit(events, { type: 'tutorial', tutorialInput: candidate })
        }
        const zoneResult = stepZone(zoneState, playerPos)
        zoneState = zoneResult.state
        for (const zoneEvent of zoneResult.events) {
          if (zoneEvent.type === 'enter' && (zoneEvent.zone === 'village' || zoneEvent.zone === 'park')) {
            banner = { zone: zoneEvent.zone, startedAtMs: nowMs }
            emit(events, { type: 'banner', zone: zoneEvent.zone })
          }
          if (zoneEvent.type === 'enter' && zoneEvent.zone === 'park' && game.quest.status !== 'none') {
            changeScene('park', events)
            changeScene('hunt', events)
          }
        }

        const inside = inGate(playerPos)
        if (inside && !gateInside) {
          banner = { zone: 'village', startedAtMs: nowMs }
          emit(events, { type: 'banner', zone: 'village' })
          emit(events, { type: 'camera-ease-start' })
          if (game.scene === 'forest') changeScene('henesys', events)
        }
        gateInside = inside
      }

      if (activeDialogue !== null && (inputs.confirm || inputs.choice !== undefined)) {
        const dialogueId = activeDialogue.treeId
        const previousLevel = game.level
        const previousQuestStatus = game.quest.status
        const result = advance(activeDialogue, inputs.choice)
        activeDialogue = result.state.finished ? null : result.state
        result.actions.forEach(dispatch)
        if (previousQuestStatus !== 'done' && game.quest.status === 'done') {
          reward = { previousLevel, currentLevel: game.level, shownAtMs: nowMs }
          emit(events, { type: 'reward', previousLevel, currentLevel: game.level })
        }
        dialogueHandled = true
        if (activeDialogue === null) {
          emit(events, { type: 'dialogue-close', dialogueId })
          if (dialogueId === 'maya') changeScene('shop', events)
          if (dialogueId === 'stan' && game.quest.status === 'done') {
            changeScene('epilogue', events)
            epilogueStartedAtMs = nowMs
          }
        }
      }

      if (activeDialogue === null && inputs.interact && !dialogueHandled) {
        const npcId = findInteractable(playerPos, playerYaw, NPCS)
        if (npcId === 'stan' || npcId === 'maya') {
          if (npcId === 'stan') changeScene(game.quest.status === 'ready' ? 'complete' : 'stan', events)
          activeDialogue = createDialogue(npcId, {
            questStatus: game.quest.status,
            purchased,
          })
          emit(events, { type: 'dialogue-open', dialogueId: npcId })
        }
      }

      if (inputs.inventory) inventoryOpen = !inventoryOpen
      if (inputs.equipItemId !== undefined) {
        const item = ITEMS.find((candidate) => candidate.id === inputs.equipItemId)
        if (item !== undefined && item.equipSlot !== undefined) {
          const inventory = equipInventoryItem(game.inventory, item)
          game = { ...game, inventory, equipment: { ...inventory.equipment } }
          binding?.setState(game)
        }
      }
      if (inputs.selectedItemId !== undefined) selectedShopItemId = inputs.selectedItemId
      if (game.scene === 'shop' && inputs.confirm && !dialogueHandled) {
        const itemId = inputs.selectedItemId ?? selectedShopItemId
          ?? ITEMS.find((item) => item.jobId === game.jobId && item.kind === 'weapon')?.id
        const item = ITEMS.find((candidate) => candidate.id === itemId)
        if (item !== undefined) {
          const mesoBefore = game.meso
          dispatch({ type: 'purchase', item })
          purchased = game.meso < mesoBefore
          selectedShopItemId = item.id
          if (purchased) emit(events, { type: 'purchase', itemId: item.id })
        }
      }

      const inPark = zoneState.zone === 'park'
      if (inPark && !dialogueOpenAtTickStart && activeDialogue === null) {
        const burnHits: CombatHit[] = []
        burns = burns.flatMap((burn) => {
          let nextTickAtMs = burn.nextTickAtMs
          let remainingTicks = burn.remainingTicks
          while (remainingTicks > 0 && nextTickAtMs <= nowMs) {
            burnHits.push({ targetId: burn.mobId, damage: burn.damagePerTick, critical: false, hitIndex: burn.remainingTicks - remainingTicks })
            remainingTicks -= 1
            nextTickAtMs += burn.intervalMs
          }
          return remainingTicks > 0 ? [{ ...burn, nextTickAtMs, remainingTicks }] : []
        })
        applyCombatHits(burnHits, events)
        const stepped = stepSpawner(spawner, {
          dtSeconds: input.dtMs / 1000,
          nowSeconds: nowMs / 1000,
          playerPosition: { x: playerPos.x, z: playerPos.z },
        }, aiRng)
        spawner = stepped.state
        if (respawnState.phase === 'alive') {
          for (const event of stepped.events) {
            if (event.type !== 'attack') continue
            const result = applyMonsterHit(playerCombat, {
              damage: event.damage,
              nowSeconds: nowMs / 1000,
            })
            playerCombat = result.state
            if (result.damageApplied > 0) {
              dispatch({ type: 'damage', amount: result.damageApplied })
              respawnState = {
                ...respawnState,
                hp: game.hp,
                maxHp: game.maxHp,
                mp: skillState.mp,
                meso: game.meso,
                position: { x: playerPos.x, z: playerPos.z },
              }
            }
            if (result.died) {
              const death = beginDeath(respawnState, nowMs / 1000)
              respawnState = death.state
              if (death.events.length > 0) emit(events, { type: 'death' })
            }
          }
        }

        const targets = spawner.slots.flatMap((slot) => {
          const mob = slot.mob
          return mob === null || mob.state === 'dying' || mob.state === 'dead'
            ? []
            : [{ id: mob.id, position: mob.position }]
        })
        const job = game.jobId === null ? null : JOBS[game.jobId]
        const playerCanAct = respawnState.phase === 'alive'
        if (job !== null && inputs.skill && playerCanAct) {
          const skill = SKILLS[job.skillId]
          const cast = tryCastSkill(skillState, skill, nowMs)
          if (cast.ok) {
            skillState = cast.state
            dispatch({ type: 'spend-mp', amount: skill.mpCost })
            const skillAttack = resolveSkillAttack({
              skillId: job.skillId,
              origin: { x: playerPos.x, z: playerPos.z },
              yaw: playerYaw,
              baseAttack: job.baseAttack,
              weaponAttack: weaponAttack(),
              targets,
              targetId: targets[0]?.id,
              impactPosition: targets[0]?.position,
              rng: combatRng,
            })
            applyCombatHits(skillAttack.hits, events)
            const affectedIds = [...new Set(skillAttack.hits.map(({ targetId }) => targetId))]
            if (skillAttack.effect.type === 'freeze') {
              spawner = {
                ...spawner,
                slots: spawner.slots.map((slot) => slot.mob === null || !affectedIds.includes(slot.mob.id)
                  ? slot
                  : { ...slot, mob: applyTimedMobEffect(slot.mob, skillAttack.effect, nowMs / 1000) }),
              }
            }
            if (skillAttack.effect.type === 'burn') {
              const ticks = skillAttack.effect.ticks ?? 0
              const durationMs = skillAttack.effect.durationMs ?? 0
              const damagePerTick = skillAttack.effect.damagePerTick ?? 0
              if (ticks > 0 && durationMs > 0 && damagePerTick > 0) {
                burns = [
                  ...burns.filter(({ mobId }) => !affectedIds.includes(mobId)),
                  ...affectedIds.map((mobId): BurnState => ({
                    mobId, damagePerTick, remainingTicks: ticks,
                    intervalMs: durationMs / ticks, nextTickAtMs: nowMs + durationMs / ticks,
                  })),
                ]
              }
            }
            if (skillAttack.effect.type === 'leap' && targets[0] !== undefined) {
              playerPos = leapDestination(playerPos, targets[0].position, skillAttack.effect.radiusMeters ?? 2.5)
            }
          } else {
            emit(events, { type: 'skill-rejected', reason: cast.reason })
          }
        }
        if (job !== null && inputs.attack && playerCanAct && nowMs >= basicReadyAtMs) {
          const modifiers = resolveEquipmentCombatModifiers(weaponBonuses(), 1.8, job.basicAttack.cooldownMs)
          const attack = resolveBasicAttack({
            origin: { x: playerPos.x, z: playerPos.z },
            yaw: playerYaw,
            baseAttack: job.baseAttack,
            weaponAttack: weaponAttack(),
            targets,
            rng: combatRng,
            rangeMeters: modifiers.rangeMeters,
          })
          basicReadyAtMs = nowMs + modifiers.cooldownMs
          applyCombatHits(attack.hits, events)
        }
      }

      const canCollectDrops = respawnState.phase === 'alive' && activeDialogue === null && !dialogueOpenAtTickStart
      const remainingDrops: DropEntity[] = []
      for (const drop of canCollectDrops ? drops : []) {
        const collection = collectDrop(
          game,
          drop,
          PIG_QUEST,
          { x: playerPos.x, y: playerPos.y ?? 0, z: playerPos.z },
          nowMs / 1000,
        )
        if (!collection.collected) {
          remainingDrops.push(drop)
          continue
        }
        collection.actions.forEach(dispatch)
        dropCollection = removeDropFromCollection(dropCollection, drop.id)
        if (drop.payload.kind === 'item') acquiredAtByItemId = {
          ...acquiredAtByItemId,
          [drop.payload.itemId]: nowMs,
        }
        emit(events, { type: 'drop-collect', dropId: drop.id, position: { ...drop.landingPosition } })
      }
      if (canCollectDrops) drops = remainingDrops

      const respawned = stepRespawn(respawnState, nowMs / 1000)
      respawnState = respawned.state
      for (const event of respawned.events) {
        if (event.type === 'respawn') {
          dispatch({ type: 'heal', hp: event.position === undefined ? 0 : respawnState.hp })
          playerCombat = { hp: respawnState.hp, invulnerableUntilSeconds: 0 }
          playerPos = { ...event.position }
          emit(events, { type: 'respawn', position: { ...event.position } })
        } else {
          spawner = clearSpawnerAggro(spawner, aiRng)
          zoneState = { zone: null }
          gateInside = false
          emit(events, { type: 'clear-monster-aggro' })
        }
      }

      notify()
      return { snapshot: snapshot(), events }
    },
  }
}
