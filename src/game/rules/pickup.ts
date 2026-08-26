import itemData from '../data/items.json' with { type: 'json' }
import { reduce, type GameAction } from '../reducers.ts'
import type { GameState } from '../state.ts'
import { rollDrops, type DropTable } from './drops.ts'
import type { ItemDefinition } from './inventory.ts'
import type { QuestDefinition } from './quest.ts'
import type { Rng } from './rng.ts'

export const DROP_ARC_SECONDS = 0.4
export const PICKUP_RANGE_METERS = 1.5

export interface PickupPosition {
  x: number
  y: number
  z: number
}

export type DropPayload =
  | { kind: 'meso', amount: number }
  | { kind: 'item', itemId: string, quantity: number }

export interface DropEntity {
  id: string
  payload: DropPayload
  origin: PickupPosition
  landingPosition: PickupPosition
  spawnedAtSeconds: number
  sourceMonsterId: string
  grantsKillCredit: boolean
}

export interface CreateDropOptions {
  sequence: number
  sourceMonsterId: string
}

export interface CollectDropResult {
  collected: boolean
  state: GameState
  actions: GameAction[]
}

const itemById = Object.fromEntries(
  (itemData as unknown as ItemDefinition[]).map((item) => [item.id, item]),
) as Record<string, ItemDefinition>

function landingOffset(index: number): { x: number, z: number } {
  if (index === 0) return { x: -0.25, z: 0 }
  const angle = (index - 1) * Math.PI * 0.75
  return { x: Math.cos(angle) * 0.25, z: Math.sin(angle) * 0.25 }
}

export function createDropEntities(
  table: DropTable,
  origin: PickupPosition,
  spawnedAtSeconds: number,
  rng: Rng,
  options: CreateDropOptions,
): DropEntity[] {
  const drop = rollDrops(table, rng)
  const payloads: DropPayload[] = [
    { kind: 'meso', amount: drop.meso },
    ...drop.items.map(({ itemId, quantity }): DropPayload => ({
      kind: 'item',
      itemId,
      quantity,
    })),
  ]

  return payloads.map((payload, index) => {
    const offset = landingOffset(index)
    return {
      id: `drop-${options.sequence}-${index}`,
      payload,
      origin: { ...origin },
      landingPosition: {
        x: origin.x + offset.x,
        y: origin.y,
        z: origin.z + offset.z,
      },
      spawnedAtSeconds,
      sourceMonsterId: options.sourceMonsterId,
      grantsKillCredit: index === 0,
    }
  })
}

export function parabolicPosition(entity: DropEntity, nowSeconds: number): PickupPosition {
  const progress = Math.max(0, Math.min(1, (
    nowSeconds - entity.spawnedAtSeconds
  ) / DROP_ARC_SECONDS))
  const inverse = 1 - progress
  return {
    x: entity.origin.x * inverse + entity.landingPosition.x * progress,
    y: entity.origin.y * inverse
      + entity.landingPosition.y * progress
      + 3.2 * progress * inverse,
    z: entity.origin.z * inverse + entity.landingPosition.z * progress,
  }
}

export function canPickup(
  entity: DropEntity,
  playerPosition: PickupPosition,
  nowSeconds: number,
): boolean {
  if (nowSeconds - entity.spawnedAtSeconds < DROP_ARC_SECONDS) return false
  return Math.hypot(
    playerPosition.x - entity.landingPosition.x,
    playerPosition.z - entity.landingPosition.z,
  ) <= PICKUP_RANGE_METERS
}

function actionsFor(entity: DropEntity, quest: QuestDefinition): GameAction[] {
  const actions: GameAction[] = []
  if (entity.payload.kind === 'meso') {
    actions.push({ type: 'adjust-meso', amount: entity.payload.amount })
  } else {
    const item = itemById[entity.payload.itemId]
    if (item === undefined) throw new Error(`unknown drop item: ${entity.payload.itemId}`)
    actions.push({ type: 'gain-item', item, quantity: entity.payload.quantity })
  }
  if (entity.grantsKillCredit) {
    actions.push({
      type: 'quest-kill',
      quest,
      monsterId: entity.sourceMonsterId,
    })
  }
  return actions
}

export function collectDrop(
  state: GameState,
  entity: DropEntity,
  quest: QuestDefinition,
  playerPosition: PickupPosition,
  nowSeconds: number,
): CollectDropResult {
  if (!canPickup(entity, playerPosition, nowSeconds)) {
    return { collected: false, state, actions: [] }
  }

  const actions = actionsFor(entity, quest)
  return {
    collected: true,
    state: actions.reduce(reduce, state),
    actions,
  }
}
