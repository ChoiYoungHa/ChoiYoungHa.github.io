import type { IpMode } from '../../game/i18n.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { zoneBannerCopy, type ActiveZoneBanner } from './zoneBannerLogic.ts'

export interface ZoneBannerProps {
  banner: ActiveZoneBanner | null
  ipMode: IpMode
}

export function ZoneBanner({ banner, ipMode }: ZoneBannerProps) {
  if (banner === null) return null
  const copy = zoneBannerCopy(banner.zone, ipMode)
  const isPark = banner.zone === 'park'
  return (
    <section
      aria-live="polite"
      aria-label="지역 진입"
      style={{
        position: 'absolute',
        top: 56,
        left: '50%',
        width: isPark ? 520 : 420,
        transform: 'translateX(-50%)',
        textAlign: 'center',
        color: HUD_TOKENS.colors.text,
        fontFamily: HUD_TOKENS.fontFamily,
        pointerEvents: 'none',
        textShadow: '0 2px 12px rgba(0,0,0,0.86)',
      }}
    >
      {copy.largeTitle !== null && <strong style={{ display: 'block', fontSize: 34, lineHeight: 1.15, letterSpacing: '0.08em' }}>{copy.largeTitle}</strong>}
      <span style={{ display: 'block', marginTop: isPark ? 5 : 0, fontSize: isPark ? 14 : 23, fontWeight: 700 }}>{copy.title}</span>
      <span style={{ display: 'block', marginTop: 5, color: '#e8d5ad', fontSize: 13, letterSpacing: '0.12em' }}>{copy.subtitle}</span>
      <span aria-hidden="true" style={{ display: 'block', width: 112, height: 1, margin: '10px auto 0', background: `linear-gradient(90deg, transparent, ${HUD_TOKENS.colors.exp}, transparent)` }} />
    </section>
  )
}
