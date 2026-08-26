import {
  addInventoryItem,
  equipInventoryItem,
  type Inventory,
  type ItemDefinition,
} from './inventory.ts'

export interface ShopState {
  jobId: string
  meso: number
  inventory: Inventory
}

export type PurchaseFailureReason = 'unavailable' | 'insufficient' | 'inventory-full'

export type PurchaseResult =
  | { ok: true, state: ShopState }
  | { ok: false, reason: PurchaseFailureReason, state: ShopState }

export function buyItem(state: ShopState, item: ItemDefinition): PurchaseResult {
  if (item.jobId !== undefined && item.jobId !== state.jobId) {
    return { ok: false, reason: 'unavailable', state }
  }
  if (state.meso < item.price) {
    return { ok: false, reason: 'insufficient', state }
  }

  const added = addInventoryItem(state.inventory, item, 1)
  if (added.remainder > 0) {
    return { ok: false, reason: 'inventory-full', state }
  }

  const inventory = item.equipSlot === undefined
    ? added.inventory
    : equipInventoryItem(added.inventory, item)

  return {
    ok: true,
    state: {
      ...state,
      meso: state.meso - item.price,
      inventory,
    },
  }
}
