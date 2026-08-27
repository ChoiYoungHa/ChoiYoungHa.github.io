import type { IpMode } from '../../game/i18n.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { rewardPopupPresentation } from './rewardPopupLogic.ts'

export interface RewardPopupProps {
  visible: boolean
  ipMode: IpMode
  previousLevel: number
  currentLevel: number
  onClose?: () => void
}

export function RewardPopup({ visible, ipMode, previousLevel, currentLevel, onClose }: RewardPopupProps) {
  if (!visible) return null
  const view = rewardPopupPresentation(ipMode, previousLevel, currentLevel)
  return (
    <section aria-label={view.title} style={{ position: 'absolute', left: '50%', top: '50%', width: 390, transform: 'translate(-50%, -50%)', padding: 22, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 12, background: HUD_TOKENS.colors.panelStrong, boxShadow: '0 14px 42px rgba(0,0,0,0.52)', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto', textAlign: 'center', ...HUD_TOKENS.borderImage.panel }}>
      {view.showLevelUp && <strong style={{ display: 'block', marginBottom: 10, color: '#f3c95d', fontSize: 30, letterSpacing: '0.12em', textShadow: '0 0 18px rgba(243,201,93,0.75)' }}>{view.levelUpText}</strong>}
      <h2 style={{ margin: '0 0 16px', fontSize: 21 }}>{view.title}</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {view.rewards.map((reward) => <div key={reward.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr', alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 12px', background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
          <img src={reward.iconUrl} alt="" style={{ width: 38, height: 38, objectFit: 'contain' }} />
          <span>{reward.text}</span>
        </div>)}
      </div>
      {onClose !== undefined && <button type="button" onClick={onClose} style={{ marginTop: 16, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 7, padding: '8px 22px', background: '#745b2c', color: '#fff7dc', font: 'inherit', cursor: 'pointer' }}>확인</button>}
    </section>
  )
}
