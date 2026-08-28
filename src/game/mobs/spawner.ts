import spawnData from '../data/spawns.json' with { type: 'json' }
import monsters from '../data/monsters.json' with { type: 'json' }
import type { Rng } from '../rules/rng.ts'
import {
  createMob,
  damageMob,
  stepMob,
  type Mob,
  type MobEvent,
  type MobStepInput,
  type Vec2,
} from './ai.ts'

export const MAX_CONCURRENT_MOBS = 10
export const RESPAWN_SECONDS = monsters.pig.respawnSeconds

export interface SpawnerSlot {
  id: string
  spawnPosition: Vec2
  mob: Mob | null
  respawnAtSeconds: number | null
}

export interface SpawnerState {
  slots: SpawnerSlot[]
  totalSpawned: number
  totalDeaths: number
  /** 2026-08-28 — 보스 슬롯. mob=null 이면 미각성 또는 격파. 리스폰 없음. */
  boss: SpawnerSlot
  bossDefeated: boolean
}

export const BOSS_ID = 'boss-the-eleventh'
export const BOSS_MONSTER_ID = 'the-eleventh'
const BOSS_SPAWN = (monsters as unknown as Record<string, { spawn?: { x: number, z: number } }>)[BOSS_MONSTER_ID]?.spawn ?? { x: -104, z: 8 }

export type SpawnerEvent = MobEvent
  | { type: 'despawn', mobId: string, respawnAtSeconds: number }
  | { type: 'respawn', mobId: string }

export interface SpawnerStepResult {
  state: SpawnerState
  events: SpawnerEvent[]
}

export function createSpawner(rng: Rng): SpawnerState {
  const points = spawnData.points.slice(0, MAX_CONCURRENT_MOBS)
  return {
    slots: points.map((point) => {
      const spawnPosition = { x: point.x, z: point.z }
      return {
        id: point.id,
        spawnPosition,
        mob: createMob(point.id, spawnPosition, rng),
        respawnAtSeconds: null,
      }
    }),
    totalSpawned: points.length,
    totalDeaths: 0,
    boss: { id: BOSS_ID, spawnPosition: { ...BOSS_SPAWN }, mob: null, respawnAtSeconds: null },
    bossDefeated: false,
  }
}

/** 보스 각성(한 번만). */
export function awakenBoss(state: SpawnerState, rng: Rng): SpawnerState {
  if (state.boss.mob !== null || state.bossDefeated) return state
  return { ...state, boss: { ...state.boss, mob: createMob(BOSS_ID, state.boss.spawnPosition, rng, BOSS_MONSTER_ID) } }
}

/** 일반 슬롯 + 보스 슬롯을 한 배열로(대상 선택·HP 바·렌더 공용). */
export function allMobs(state: SpawnerState): Mob[] {
  const mobs: Mob[] = []
  for (const slot of state.slots) if (slot.mob !== null) mobs.push(slot.mob)
  if (state.boss.mob !== null) mobs.push(state.boss.mob)
  return mobs
}

export function damageSpawnerMob(
  state: SpawnerState,
  mobId: string,
  damage: number,
  nowSeconds: number,
): SpawnerState {
  return {
    ...state,
    slots: state.slots.map((slot) => slot.mob?.id === mobId
      ? { ...slot, mob: damageMob(slot.mob, damage, nowSeconds).mob }
      : slot),
    boss: state.boss.mob !== null && state.boss.mob.id === mobId
      ? { ...state.boss, mob: damageMob(state.boss.mob, damage, nowSeconds).mob }
      : state.boss,
  }
}

export function clearSpawnerAggro(state: SpawnerState, rng: Rng): SpawnerState {
  return {
    ...state,
    slots: state.slots.map((slot) => {
      const mob = slot.mob
      if (mob === null || (mob.state !== 'chase' && mob.state !== 'attack')) return slot
      return {
        ...slot,
        mob: {
          ...mob,
          state: 'wander',
          wanderTarget: {
            x: mob.spawnPosition.x + (rng() * 2 - 1) * 5,
            z: mob.spawnPosition.z + (rng() * 2 - 1) * 5,
          },
          attackReadyAtSeconds: 0,
        },
      }
    }),
  }
}

export function stepSpawner(
  state: SpawnerState,
  input: MobStepInput,
  rng: Rng,
): SpawnerStepResult {
  const events: SpawnerEvent[] = []
  let totalSpawned = state.totalSpawned
  let totalDeaths = state.totalDeaths

  // 보스: 리스폰 없음. dead 가 되면 슬롯을 비우고 bossDefeated 를 세운다.
  let boss = state.boss
  let bossDefeated = state.bossDefeated
  if (boss.mob !== null) {
    const result = stepMob(boss.mob, input, rng)
    events.push(...result.events)
    if (result.mob.state === 'dead') { boss = { ...boss, mob: null }; bossDefeated = true; events.push({ type: 'despawn', mobId: boss.id, respawnAtSeconds: Infinity }) }
    else boss = { ...boss, mob: result.mob }
  }
  const slots = state.slots.map((slot): SpawnerSlot => {
    if (slot.mob !== null) {
      const result = stepMob(slot.mob, input, rng)
      events.push(...result.events)
      if (result.mob.state !== 'dead') return { ...slot, mob: result.mob }

      const respawnAtSeconds = input.nowSeconds + RESPAWN_SECONDS
      totalDeaths += 1
      events.push({ type: 'despawn', mobId: slot.id, respawnAtSeconds })
      return { ...slot, mob: null, respawnAtSeconds }
    }

    if (
      slot.respawnAtSeconds !== null
      && input.nowSeconds >= slot.respawnAtSeconds
    ) {
      totalSpawned += 1
      events.push({ type: 'respawn', mobId: slot.id })
      return {
        ...slot,
        mob: createMob(slot.id, slot.spawnPosition, rng),
        respawnAtSeconds: null,
      }
    }
    return slot
  })

  return {
    state: { slots, totalSpawned, totalDeaths, boss, bossDefeated },
    events,
  }
}
