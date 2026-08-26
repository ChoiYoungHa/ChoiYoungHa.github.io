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
}

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
  }
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
    state: { slots, totalSpawned, totalDeaths },
    events,
  }
}
