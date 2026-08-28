import monsters from '../data/monsters.json' with { type: 'json' }
import type { Rng } from '../rules/rng.ts'

export type MobAiState = 'wander' | 'chase' | 'attack' | 'dying' | 'dead'

export interface Vec2 {
  x: number
  z: number
}

export interface Mob {
  id: string
  /** 2026-08-28 — 몬스터 정의 키(monsters.json). 기본 'pig', 보스 'the-eleventh'. */
  monsterId: string
  maxHp: number
  state: MobAiState
  position: Vec2
  spawnPosition: Vec2
  wanderTarget: Vec2
  hp: number
  attackReadyAtSeconds: number
  dyingUntilSeconds: number | null
  frozenUntilSeconds: number
}

export interface MobStepInput {
  dtSeconds: number
  nowSeconds: number
  playerPosition: Vec2
}

export type MobEvent =
  | { type: 'state-change', mobId: string, from: MobAiState, to: MobAiState }
  | { type: 'attack', mobId: string, damage: number }

export interface MobStepResult {
  mob: Mob
  events: MobEvent[]
}

export interface MonsterStats {
  hp: number
  attack: number
  speed: number
  detectionRadius: number
  attackRange?: number
  attackCooldownSeconds?: number
}
const MONSTERS = monsters as unknown as Record<string, MonsterStats>
const pig = monsters.pig
export const WANDER_RADIUS_METERS = 5
export const CONTACT_RANGE_METERS = 1.2
export const ATTACK_COOLDOWN_SECONDS = 2
export function monsterStats(monsterId: string): MonsterStats {
  return MONSTERS[monsterId] ?? pig
}
export function attackRangeOf(mob: Pick<Mob, 'monsterId'>): number {
  return monsterStats(mob.monsterId).attackRange ?? CONTACT_RANGE_METERS
}
export const DYING_SECONDS = 0.6

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function randomWanderTarget(spawn: Vec2, rng: Rng): Vec2 {
  const angle = rng() * Math.PI * 2
  const radius = Math.sqrt(rng()) * WANDER_RADIUS_METERS
  return {
    x: spawn.x + Math.cos(angle) * radius,
    z: spawn.z + Math.sin(angle) * radius,
  }
}

function moveToward(position: Vec2, target: Vec2, distanceMeters: number): Vec2 {
  const dx = target.x - position.x
  const dz = target.z - position.z
  const remaining = Math.hypot(dx, dz)
  if (remaining === 0 || remaining <= distanceMeters) return { ...target }
  const scale = distanceMeters / remaining
  return { x: position.x + dx * scale, z: position.z + dz * scale }
}

function changeState(mob: Mob, to: MobAiState): MobStepResult {
  return {
    mob: { ...mob, state: to },
    events: [{ type: 'state-change', mobId: mob.id, from: mob.state, to }],
  }
}

export function createMob(id: string, spawnPosition: Vec2, rng: Rng, monsterId = 'pig'): Mob {
  const stats = monsterStats(monsterId)
  return {
    id,
    monsterId,
    maxHp: stats.hp,
    state: 'wander',
    position: { ...spawnPosition },
    spawnPosition: { ...spawnPosition },
    wanderTarget: randomWanderTarget(spawnPosition, rng),
    hp: stats.hp,
    attackReadyAtSeconds: 0,
    dyingUntilSeconds: null,
    frozenUntilSeconds: 0,
  }
}

export function damageMob(mob: Mob, damage: number, nowSeconds: number): MobStepResult {
  if (mob.state === 'dying' || mob.state === 'dead' || damage <= 0) {
    return { mob, events: [] }
  }
  const hp = Math.max(0, mob.hp - damage)
  if (hp > 0) return { mob: { ...mob, hp }, events: [] }
  return {
    mob: {
      ...mob,
      hp: 0,
      state: 'dying',
      dyingUntilSeconds: nowSeconds + DYING_SECONDS,
    },
    events: [{ type: 'state-change', mobId: mob.id, from: mob.state, to: 'dying' }],
  }
}

export function stepMob(mob: Mob, input: MobStepInput, rng: Rng): MobStepResult {
  if (mob.state === 'dead') return { mob, events: [] }
  if (mob.state === 'dying') {
    if (input.nowSeconds < (mob.dyingUntilSeconds ?? Infinity)) return { mob, events: [] }
    return changeState(mob, 'dead')
  }
  if (input.nowSeconds < mob.frozenUntilSeconds) return { mob, events: [] }

  const stats = monsterStats(mob.monsterId)
  const contactRange = stats.attackRange ?? CONTACT_RANGE_METERS
  const cooldown = stats.attackCooldownSeconds ?? ATTACK_COOLDOWN_SECONDS
  const playerDistance = distance(mob.position, input.playerPosition)
  if (mob.state === 'wander') {
    if (playerDistance <= stats.detectionRadius) return changeState(mob, 'chase')

    const position = moveToward(
      mob.position,
      mob.wanderTarget,
      stats.speed * 0.5 * input.dtSeconds,
    )
    const reachedTarget = distance(position, mob.wanderTarget) <= 1e-6
    return {
      mob: {
        ...mob,
        position,
        wanderTarget: reachedTarget ? randomWanderTarget(mob.spawnPosition, rng) : mob.wanderTarget,
      },
      events: [],
    }
  }

  if (mob.state === 'chase') {
    if (playerDistance <= contactRange) return changeState(mob, 'attack')
    if (playerDistance > stats.detectionRadius) {
      const result = changeState(mob, 'wander')
      return {
        mob: { ...result.mob, wanderTarget: randomWanderTarget(mob.spawnPosition, rng) },
        events: result.events,
      }
    }
    return {
      mob: {
        ...mob,
        position: moveToward(mob.position, input.playerPosition, stats.speed * input.dtSeconds),
      },
      events: [],
    }
  }

  if (playerDistance > contactRange) {
    return playerDistance <= stats.detectionRadius
      ? changeState(mob, 'chase')
      : {
        ...changeState(mob, 'wander'),
        mob: { ...mob, state: 'wander', wanderTarget: randomWanderTarget(mob.spawnPosition, rng) },
      }
  }
  if (input.nowSeconds < mob.attackReadyAtSeconds) return { mob, events: [] }
  return {
    mob: { ...mob, attackReadyAtSeconds: input.nowSeconds + cooldown },
    events: [{ type: 'attack', mobId: mob.id, damage: stats.attack }],
  }
}
