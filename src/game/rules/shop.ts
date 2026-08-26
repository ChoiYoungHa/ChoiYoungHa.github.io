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

export type PurchaseFailureReason = '장착 불가' | '메소 부족' | '인벤토리 가득 참'

export type PurchaseResult =
  | { ok: true, state: ShopState }
  | { ok: false, reason: PurchaseFailureReason, state: ShopState }

export function buyItem(state: ShopState, item: ItemDefinition): PurchaseResult {
  if (item.jobId !== undefined && item.jobId !== state.jobId) {
    return { ok: false, reason: '장착 불가', state }
  }
  if (state.meso < item.price) {
    return { ok: false, reason: '메소 부족', state }
  }

  const added = addInventoryItem(state.inventory, item, 1)
  if (added.remainder > 0) {
    return { ok: false, reason: '인벤토리 가득 참', state }
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
