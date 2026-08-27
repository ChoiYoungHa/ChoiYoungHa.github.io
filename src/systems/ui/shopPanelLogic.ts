import iconData from '../../game/data/itemIcons.json' with { type: 'json' }
import rawItems from '../../game/data/items.json' with { type: 'json' }
import { t, type IpMode } from '../../game/i18n.ts'
import { tooltipForItem, type ItemDefinition } from '../../game/rules/inventory.ts'
import { buyItem, type PurchaseResult, type ShopState } from '../../game/rules/shop.ts'

// 2026-08-27 영하님: 전사 단일 → 전사 무기 + 소비품만 판다.
const SHOP_ITEMS = (rawItems as unknown as ItemDefinition[]).filter((item) => item.id === 'weapon.steel-sword' || item.kind === 'consumable') // 영하님: 나무검 대신 강철검
const ITEM_ICONS: Readonly<Record<string, string>> = iconData.items

export interface ShopItemPresentation {
  id: string
  name: string
  price: number
  iconUrl: string
  disabled: boolean
  disabledReason: string | null
}

export interface ShopDetailPresentation extends ShopItemPresentation {
  bonusLines: string[]
}

export interface ShopPanelPresentation {
  title: string
  currency: string
  meso: number
  items: ShopItemPresentation[]
  detail: ShopDetailPresentation | null
}

function iconFor(itemId: string): string {
  return ITEM_ICONS[itemId] ?? ''
}

function localizedFailure(result: PurchaseResult, ipMode: IpMode): string | null {
  if (result.ok) return null
  const key = result.reason === 'unavailable'
    ? 's05.shop.unavailable'
    : result.reason === 'insufficient'
      ? 's05.shop.insufficient'
      : 's05.shop.inventoryFull'
  return t(key, ipMode)
}

function presentItem(state: ShopState, item: ItemDefinition, ipMode: IpMode): ShopItemPresentation {
  const result = buyItem(state, item)
  return {
    id: item.id,
    name: t(item.nameKey, ipMode),
    price: item.price,
    iconUrl: iconFor(item.id),
    disabled: !result.ok,
    disabledReason: localizedFailure(result, ipMode),
  }
}

export function shopPanelPresentation(
  state: ShopState,
  selectedItemId: string | null,
  ipMode: IpMode,
): ShopPanelPresentation {
  const items = SHOP_ITEMS.map((item) => presentItem(state, item, ipMode))
  const selected = SHOP_ITEMS.find((item) => item.id === selectedItemId) ?? null
  const selectedView = selected === null ? null : presentItem(state, selected, ipMode)
  return {
    title: t('s05.shop.title', ipMode),
    currency: t('s09.reward.currency', ipMode).split(/\s+/u)[0],
    meso: state.meso,
    items,
    detail: selected === null || selectedView === null ? null : {
      ...selectedView,
      bonusLines: tooltipForItem(selected, t(selected.nameKey, ipMode)).split('\n').slice(1),
    },
  }
}

export function purchaseShopItem(state: ShopState, itemId: string): PurchaseResult {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === itemId)
  if (item === undefined) throw new Error(`unknown shop item: ${itemId}`)
  return buyItem(state, item)
}
