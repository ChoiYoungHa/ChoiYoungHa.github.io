export const INVENTORY_COLUMNS = 4
export const INVENTORY_ROWS = 6
export const INVENTORY_CAPACITY = INVENTORY_COLUMNS * INVENTORY_ROWS

export type EquipmentSlot = 'weapon' | 'head'
export type ItemKind = EquipmentSlot | 'currency'
export type ItemBonuses = Record<string, number>

export interface ItemDefinition {
  id: string
  name: string
  kind: ItemKind
  equipSlot?: EquipmentSlot
  jobId?: string
  price: number
  sellPrice?: number
  stackLimit: number
  bonuses: ItemBonuses
}

export interface ItemStack {
  itemId: string
  quantity: number
}

export interface Inventory {
  slots: Array<ItemStack | null>
  equipment: Record<EquipmentSlot, string | null>
}

export interface AddItemResult {
  inventory: Inventory
  added: number
  remainder: number
}

export function createInventory(): Inventory {
  return {
    slots: Array.from({ length: INVENTORY_CAPACITY }, () => null),
    equipment: { weapon: null, head: null },
  }
}

function cloneInventory(inventory: Inventory): Inventory {
  return {
    slots: inventory.slots.map((stack) => stack === null ? null : { ...stack }),
    equipment: { ...inventory.equipment },
  }
}

export function inventoryQuantity(inventory: Inventory, itemId: string): number {
  return inventory.slots.reduce(
    (total, stack) => total + (stack?.itemId === itemId ? stack.quantity : 0),
    0,
  )
}

export function addInventoryItem(
  inventory: Inventory,
  item: ItemDefinition,
  quantity: number,
): AddItemResult {
  if (item.kind === 'currency') {
    throw new Error('currency is tracked separately from inventory slots')
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError('quantity must be a positive integer')
  }

  const next = cloneInventory(inventory)
  let remainder = quantity

  for (const stack of next.slots) {
    if (stack?.itemId !== item.id || stack.quantity >= item.stackLimit) continue
    const amount = Math.min(remainder, item.stackLimit - stack.quantity)
    stack.quantity += amount
    remainder -= amount
    if (remainder === 0) break
  }

  while (remainder > 0) {
    const emptyIndex = next.slots.findIndex((stack) => stack === null)
    if (emptyIndex < 0) break
    const amount = Math.min(remainder, item.stackLimit)
    next.slots[emptyIndex] = { itemId: item.id, quantity: amount }
    remainder -= amount
  }

  return {
    inventory: remainder === quantity ? inventory : next,
    added: quantity - remainder,
    remainder,
  }
}

export function equipInventoryItem(inventory: Inventory, item: ItemDefinition): Inventory {
  if (item.equipSlot === undefined) {
    throw new Error(`${item.id} is not equippable`)
  }
  if (inventoryQuantity(inventory, item.id) < 1) {
    throw new Error(`${item.id} is not in inventory`)
  }

  const next = cloneInventory(inventory)
  next.equipment[item.equipSlot] = item.id
  return next
}

export function effectiveBonuses(
  inventory: Inventory,
  itemById: Record<string, ItemDefinition>,
): ItemBonuses {
  const total: ItemBonuses = {}
  for (const itemId of Object.values(inventory.equipment)) {
    if (itemId === null) continue
    const item = itemById[itemId]
    if (item === undefined) continue
    for (const [key, value] of Object.entries(item.bonuses)) {
      total[key] = (total[key] ?? 0) + value
    }
  }
  return total
}

const BONUS_LABELS: Record<string, string> = {
  attack: '공격력',
  range: '사거리',
  magic: '마력',
  attackSpeedPercent: '공격 속도',
  luck: '행운',
}

export function tooltipForItem(item: ItemDefinition): string {
  const bonusLines = Object.entries(item.bonuses).map(([key, value]) => {
    const suffix = key === 'attackSpeedPercent' ? '%' : ''
    return `${BONUS_LABELS[key] ?? key} +${value}${suffix}`
  })
  return [item.name, ...bonusLines].join('\n')
}
