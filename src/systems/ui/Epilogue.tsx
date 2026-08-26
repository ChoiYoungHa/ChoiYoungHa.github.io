import type { IpMode } from '../../game/i18n.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { epiloguePresentation } from './epilogueLogic.ts'

export interface EpilogueProps {
  elapsedMs: number
  ipMode: IpMode
  onRetry: () => void
  onFreeExplore: () => void
}

export function Epilogue({ elapsedMs, ipMode, onRetry, onFreeExplore }: EpilogueProps) {
  const view = epiloguePresentation(elapsedMs, ipMode)
  const buttonStyle = { border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: '11px 22px', background: HUD_TOKENS.colors.panelStrong, color: HUD_TOKENS.colors.text, cursor: 'pointer', font: 'inherit' }
  return (
    <section aria-label="에필로그" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg, rgba(15,16,20,0.18), rgba(15,16,20,0.62))', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, textAlign: 'center', pointerEvents: 'none' }}>
      <div style={{ width: 720 }}>
        {view.lines.map((line) => <p key={line.id} style={{ margin: '14px 0', opacity: line.opacity, fontSize: 24, lineHeight: 1.4, textShadow: '0 2px 16px rgba(0,0,0,0.82)' }}>{line.text}</p>)}
        {view.showActions && <div style={{ marginTop: 30 }}>
          <p style={{ marginBottom: 24, color: '#d9c9a7', fontSize: 14 }}>{view.teaser}</p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, pointerEvents: 'auto' }}>
            <button type="button" onClick={onRetry} style={buttonStyle}>{view.actions.retry}</button>
            <button type="button" onClick={onFreeExplore} style={buttonStyle}>{view.actions.freeExplore}</button>
          </div>
        </div>}
      </div>
    </section>
  )
}
