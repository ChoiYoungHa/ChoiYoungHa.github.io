import type { IpMode } from '../../game/i18n.ts'
import type { Inventory } from '../../game/rules/inventory.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { inventoryPanelPresentation } from './inventoryPanelLogic.ts'
import styles from './InventoryPanel.module.css'

export interface InventoryPanelProps {
  open: boolean
  inventory: Inventory
  hoveredSlotIndex: number | null
  acquiredAtByItemId: Readonly<Record<string, number>>
  nowMs: number
  ipMode: IpMode
  onHoverSlot: (slotIndex: number | null) => void
  onEquip: (itemId: string) => void
  /** 2026-08-28 — 소비 아이템을 퀵슬롯 3~6 에 등록. */
  onBind?: (itemId: string, slot: 3 | 4 | 5 | 6) => void
  quickSlots?: Record<'3' | '4' | '5' | '6', string | null>
}

export function InventoryPanel({ open, inventory, hoveredSlotIndex, acquiredAtByItemId, nowMs, ipMode, onHoverSlot, onEquip, onBind, quickSlots }: InventoryPanelProps) {
  if (!open) return null
  const view = inventoryPanelPresentation(inventory, hoveredSlotIndex, acquiredAtByItemId, nowMs, ipMode)
  const box = { border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 9, background: HUD_TOKENS.colors.panelStrong }
  return (
    <section aria-label={view.title} style={{ position: 'absolute', left: '50%', top: '50%', width: 690, height: 470, transform: 'translate(-50%, -50%)', display: 'grid', gridTemplateColumns: '400px 1fr', gap: 14, padding: 18, boxSizing: 'border-box', ...box, color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto' }}>
      <div>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{view.title}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 82px)', gridAutoRows: '58px', gap: 8 }}>
          {view.cells.map((cell) => (
            <button key={cell.index} type="button" className={cell.isNew ? styles.newItem : undefined} onMouseEnter={() => onHoverSlot(cell.index)} onMouseLeave={() => onHoverSlot(null)} onClick={() => cell.itemId !== null && onEquip(cell.itemId)} style={{ position: 'relative', border: cell.isNew ? '2px solid #f0c55b' : `1px solid ${cell.equipped ? '#c8924d' : HUD_TOKENS.colors.border}`, borderRadius: 7, background: 'rgba(255,255,255,0.05)', color: HUD_TOKENS.colors.text, cursor: cell.itemId === null ? 'default' : 'pointer' }}>
              {cell.itemId !== null && <img src={cell.iconUrl} alt={cell.name} style={{ width: 46, height: 46, objectFit: 'contain' }} />}
              {cell.quantity > 1 && <span style={{ position: 'absolute', right: 5, bottom: 3, fontSize: 10 }}>×{cell.quantity}</span>}
            </button>
          ))}
        </div>
      </div>
      <aside style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 12 }}>
        <div style={{ ...box, padding: 12 }}>
          {(['weapon', 'head'] as const).map((slot) => {
            const item = view.equipment[slot]
            return <div key={slot} style={{ display: 'grid', gridTemplateColumns: '52px 1fr', alignItems: 'center', minHeight: 58, borderBottom: slot === 'weapon' ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
              <div style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 6 }}>{item !== null && <img src={item.iconUrl} alt="" style={{ width: 38, height: 38, objectFit: 'contain' }} />}</div>
              <span><small style={{ display: 'block', color: HUD_TOKENS.colors.muted }}>{item?.label ?? (slot === 'weapon' ? '무기' : '머리')}</small>{item?.name ?? '—'}</span>
            </div>
          })}
        </div>
        <div style={{ ...box, padding: 12 }}>
          <strong>{view.statsTitle}</strong>
          {Object.entries(view.stats).length === 0 ? <p style={{ color: HUD_TOKENS.colors.muted }}>추가 능력치 없음</p> : Object.entries(view.stats).map(([key, value]) => <div key={key} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}><span>{key}</span><span>+{value}</span></div>)}
        </div>
        {view.tooltip !== null && <div role="tooltip" style={{ ...box, alignSelf: 'end', padding: 12 }}>
          {view.tooltip.lines.map((line, index) => <div key={`${line}-${index}`} style={{ color: index === 0 ? HUD_TOKENS.colors.text : '#d8c692' }}>{line}</div>)}
          <small style={{ display: 'block', marginTop: 8, color: HUD_TOKENS.colors.muted }}>{view.tooltip.actionLabel}</small>
          {view.tooltip.consumable && onBind !== undefined && (
            <div aria-label="퀵슬롯 등록" style={{ marginTop: 8, display: 'flex', gap: 4, alignItems: 'center' }}>
              <small style={{ color: HUD_TOKENS.colors.muted }}>퀵슬롯</small>
              {([3, 4, 5, 6] as const).map((slot) => {
                const bound = quickSlots?.[String(slot) as '3' | '4' | '5' | '6'] === view.tooltip?.itemId
                return <button key={slot} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => view.tooltip !== null && onBind(view.tooltip.itemId, slot)} style={{ width: 26, height: 24, borderRadius: 5, border: `1px solid ${bound ? '#f0c55b' : HUD_TOKENS.colors.border}`, background: bound ? 'rgba(240,197,91,0.25)' : 'rgba(255,255,255,0.06)', color: HUD_TOKENS.colors.text, cursor: 'pointer', fontSize: 12 }}>{slot}</button>
              })}
            </div>
          )}
        </div>}
      </aside>
    </section>
  )
}
