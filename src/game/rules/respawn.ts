import mainPath from '../../data/main-path.json' with { type: 'json' }
import zones from '../data/zones.json' with { type: 'json' }

export type RespawnPhase = 'alive' | 'dying'

export interface RespawnPosition {
  x: number
  z: number
}

export interface RespawnState {
  phase: RespawnPhase
  hp: number
  maxHp: number
  mp: number
  meso: number
  position: RespawnPosition
  dyingUntilSeconds: number | null
}

export type RespawnEvent =
  | { type: 'death-start' }
  | { type: 'respawn', position: RespawnPosition }
  | { type: 'clear-monster-aggro' }

export interface RespawnResult {
  state: RespawnState
  events: RespawnEvent[]
}

export const DEATH_DURATION_SECONDS = 1.5

const village = zones.zones.village
const entrance = mainPath.waypoints.find((waypoint) => (
  waypoint.x >= village.min.x
  && waypoint.x <= village.max.x
  && waypoint.z >= village.min.z
  && waypoint.z <= village.max.z
))

if (entrance === undefined) {
  throw new Error('main path does not intersect the village AABB')
}

export const RESPAWN_POSITION: RespawnPosition = {
  x: entrance.x,
  z: entrance.z,
}

export function beginDeath(state: RespawnState, nowSeconds: number): RespawnResult {
  if (state.phase !== 'alive' || state.hp > 0) return { state, events: [] }
  return {
    state: {
      ...state,
      phase: 'dying',
      dyingUntilSeconds: nowSeconds + DEATH_DURATION_SECONDS,
    },
    events: [{ type: 'death-start' }],
  }
}

export function stepRespawn(state: RespawnState, nowSeconds: number): RespawnResult {
  if (
    state.phase !== 'dying'
    || state.dyingUntilSeconds === null
    || nowSeconds < state.dyingUntilSeconds
  ) {
    return { state, events: [] }
  }

  const position = { ...RESPAWN_POSITION }
  return {
    state: {
      ...state,
      phase: 'alive',
      hp: Math.ceil(state.maxHp * 0.5),
      position,
      dyingUntilSeconds: null,
    },
    events: [
      { type: 'respawn', position },
      { type: 'clear-monster-aggro' },
    ],
  }
}
