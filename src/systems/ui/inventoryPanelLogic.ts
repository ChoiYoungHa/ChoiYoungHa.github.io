import rawIcons from '../../game/data/icons.json' with { type: 'json' }
import rawItems from '../../game/data/items.json' with { type: 'json' }
import { t, type IpMode } from '../../game/i18n.ts'
import {
  effectiveBonuses,
  tooltipForItem,
  type EquipmentSlot,
  type Inventory,
  type ItemDefinition,
} from '../../game/rules/inventory.ts'

interface IconEntry { icon: string }
interface IconCatalog { icons: Record<string, IconEntry> }

export const NEW_ITEM_PULSE_MS = 4_000
const ITEMS = rawItems as unknown as ItemDefinition[]
const ITEM_BY_ID = Object.fromEntries(ITEMS.map((item) => [item.id, item]))
const ICONS = (rawIcons as unknown as IconCatalog).icons
const ITEM_ICON_IDS: Readonly<Record<string, string>> = {
  'weapon.wooden-sword': 'wpn.sword.wooden',
  'weapon.hunting-bow': 'wpn.bow.hunting',
  'weapon.oak-staff': 'wpn.staff.oak',
  'weapon.iron-dagger': 'wpn.dagger.iron',
  'head.pig-ribbon': 'itm.pigribbon',
}

export interface InventoryCellPresentation {
  index: number
  itemId: string | null
  name: string
  iconUrl: string
  quantity: number
  equipped: boolean
  isNew: boolean
}

export interface EquipmentPresentation {
  slot: EquipmentSlot
  label: string
  itemId: string
  name: string
  iconUrl: string
}

export interface InventoryTooltipPresentation {
  itemId: string
  lines: string[]
  actionLabel: string
}

export interface InventoryPanelPresentation {
  title: string
  cells: InventoryCellPresentation[]
  equipment: Record<EquipmentSlot, EquipmentPresentation | null>
  statsTitle: string
  stats: Record<string, number>
  tooltip: InventoryTooltipPresentation | null
}

function iconFor(itemId: string): string {
  const iconId = ITEM_ICON_IDS[itemId]
  return iconId === undefined ? '' : (ICONS[iconId]?.icon ?? '')
}

function isNewItem(itemId: string, acquiredAtByItemId: Readonly<Record<string, number>>, nowMs: number): boolean {
  const acquiredAt = acquiredAtByItemId[itemId]
  if (acquiredAt === undefined) return false
  const elapsed = nowMs - acquiredAt
  return elapsed >= 0 && elapsed < NEW_ITEM_PULSE_MS
}

function equipmentPresentation(inventory: Inventory, slot: EquipmentSlot, ipMode: IpMode): EquipmentPresentation | null {
  const itemId = inventory.equipment[slot]
  if (itemId === null) return null
  const item = ITEM_BY_ID[itemId]
  if (item === undefined) return null
  return {
    slot,
    label: t(`s08.slot.${slot}`, ipMode),
    itemId,
    name: item.name,
    iconUrl: iconFor(itemId),
  }
}

export function inventoryPanelPresentation(
  inventory: Inventory,
  hoveredSlotIndex: number | null,
  acquiredAtByItemId: Readonly<Record<string, number>>,
  nowMs: number,
  ipMode: IpMode,
): InventoryPanelPresentation {
  const cells = inventory.slots.map((stack, index): InventoryCellPresentation => {
    if (stack === null) return { index, itemId: null, name: '', iconUrl: '', quantity: 0, equipped: false, isNew: false }
    const item = ITEM_BY_ID[stack.itemId]
    return {
      index,
      itemId: stack.itemId,
      name: item?.name ?? stack.itemId,
      iconUrl: iconFor(stack.itemId),
      quantity: stack.quantity,
      equipped: Object.values(inventory.equipment).includes(stack.itemId),
      isNew: isNewItem(stack.itemId, acquiredAtByItemId, nowMs),
    }
  })
  const hovered = hoveredSlotIndex === null ? null : inventory.slots[hoveredSlotIndex]
  const hoveredItem = hovered === null || hovered === undefined ? null : ITEM_BY_ID[hovered.itemId]
  return {
    title: t('s08.inventory', ipMode),
    cells,
    equipment: {
      weapon: equipmentPresentation(inventory, 'weapon', ipMode),
      head: equipmentPresentation(inventory, 'head', ipMode),
    },
    statsTitle: t('s08.stats', ipMode),
    stats: effectiveBonuses(inventory, ITEM_BY_ID),
    tooltip: hoveredItem === null || hoveredItem === undefined ? null : {
      itemId: hoveredItem.id,
      lines: tooltipForItem(hoveredItem).split('\n'),
      actionLabel: Object.values(inventory.equipment).includes(hoveredItem.id)
        ? t('s08.tooltip.unequip', ipMode)
        : t('s08.tooltip.equip', ipMode),
    },
  }
}
