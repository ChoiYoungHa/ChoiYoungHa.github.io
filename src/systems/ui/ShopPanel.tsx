import type { PurchaseResult, ShopState } from '../../game/rules/shop.ts'
import type { IpMode } from '../../game/i18n.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { purchaseShopItem, shopPanelPresentation } from './shopPanelLogic.ts'

export interface ShopPanelProps {
  state: ShopState
  selectedItemId: string | null
  ipMode: IpMode
  onSelect: (itemId: string) => void
  onPurchase: (result: PurchaseResult) => void
  onAfterPurchase: () => void
}

export function ShopPanel({ state, selectedItemId, ipMode, onSelect, onPurchase, onAfterPurchase }: ShopPanelProps) {
  const view = shopPanelPresentation(state, selectedItemId, ipMode)
  const panelStyle = {
    border: `1px solid ${HUD_TOKENS.colors.border}`,
    borderRadius: 10,
    background: HUD_TOKENS.colors.panelStrong,
  }

  return (
    <section aria-label={view.title} style={{ position: 'absolute', left: '50%', top: '50%', width: 760, height: 460, transform: 'translate(-50%, -50%)', display: 'grid', gridTemplateColumns: '310px 1fr', gridTemplateRows: '1fr 48px', gap: 12, padding: 18, boxSizing: 'border-box', ...panelStyle, ...HUD_TOKENS.borderImage.panel, color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateRows: 'auto repeat(4, 1fr)', gap: 8 }}>
        <h2 style={{ margin: '0 0 2px', fontSize: 20 }}>{view.title}</h2>
        {view.items.map((item) => (
          <button key={item.id} type="button" onClick={() => onSelect(item.id)} style={{ display: 'grid', gridTemplateColumns: '58px 1fr auto', alignItems: 'center', gap: 10, border: item.id === selectedItemId ? '1px solid #edc76e' : `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: 8, background: item.disabled ? 'rgba(35,35,38,0.68)' : 'rgba(255,255,255,0.06)', color: item.disabled ? HUD_TOKENS.colors.muted : HUD_TOKENS.colors.text, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
            <img src={item.iconUrl} alt="" style={{ width: 48, height: 48, objectFit: 'contain', filter: item.disabled ? 'grayscale(1)' : undefined }} />
            <span><strong style={{ display: 'block' }}>{item.name}</strong><small>{item.disabledReason ?? ''}</small></span>
            <span>{item.price.toLocaleString('ko-KR')}</span>
          </button>
        ))}
      </div>
      <div style={{ ...panelStyle, padding: 18 }}>
        {view.detail === null ? <p style={{ color: HUD_TOKENS.colors.muted }}>아이템을 선택하세요</p> : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <img src={view.detail.iconUrl} alt="" style={{ width: 96, height: 96, alignSelf: 'center', objectFit: 'contain', filter: view.detail.disabled ? 'grayscale(1)' : undefined }} />
            <h3 style={{ margin: '12px 0 6px', fontSize: 20 }}>{view.detail.name}</h3>
            {view.detail.bonusLines.map((line) => <span key={line} style={{ color: '#d8c692', lineHeight: 1.6 }}>{line}</span>)}
            {view.detail.disabledReason !== null && <p style={{ color: '#cf8d82' }}>{view.detail.disabledReason}</p>}
            <button type="button" disabled={view.detail.disabled} onClick={() => {
              const result = purchaseShopItem(state, view.detail?.id ?? '')
              onPurchase(result)
              if (result.ok) onAfterPurchase()
            }} style={{ marginTop: 'auto', border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: '12px 16px', background: view.detail.disabled ? '#34343a' : '#81642b', color: view.detail.disabled ? '#85858b' : '#fff7dc', cursor: view.detail.disabled ? 'not-allowed' : 'pointer', font: 'inherit', fontWeight: 700 }}>
              구매 · {view.detail.price.toLocaleString('ko-KR')} {view.currency}
            </button>
          </div>
        )}
      </div>
      <footer style={{ gridColumn: '1 / -1', alignSelf: 'center', textAlign: 'right', fontWeight: 700 }}>보유 {view.currency} {view.meso.toLocaleString('ko-KR')}</footer>
    </section>
  )
}
