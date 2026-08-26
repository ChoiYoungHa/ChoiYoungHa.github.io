import type { IpMode } from '../../game/i18n.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { tutorialHintsPresentation, tutorialStateFromEvents, type TutorialInputEvent } from './tutorialHintsLogic.ts'

export interface TutorialHintsProps {
  inputEvents: readonly TutorialInputEvent[]
  narrationLineIndex: 0 | 1 | null
  ipMode: IpMode
}

export function TutorialHints({ inputEvents, narrationLineIndex, ipMode }: TutorialHintsProps) {
  const state = tutorialStateFromEvents(inputEvents)
  const view = tutorialHintsPresentation(state, ipMode)
  return (
    <div style={{ position: 'absolute', inset: 0, color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'none' }}>
      <section aria-label="튜토리얼 조작" style={{ position: 'absolute', left: 24, top: '50%', width: 190, transform: 'translateY(-50%)', padding: 14, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 9, background: HUD_TOKENS.colors.panel }}>
        {view.followText === null ? view.hints.map((hint) => <div key={hint.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', alignItems: 'center', margin: '7px 0', color: hint.completed ? '#c7b177' : hint.current ? HUD_TOKENS.colors.text : HUD_TOKENS.colors.muted, opacity: hint.current || hint.completed ? 1 : 0.55 }}>
          <span aria-hidden="true">{hint.completed ? '✓' : hint.current ? '›' : '·'}</span><span>{hint.label}</span>
        </div>) : <strong style={{ display: 'block', textAlign: 'center', color: '#e7ce8a' }}>{view.followText}</strong>}
      </section>
      {narrationLineIndex !== null && <p aria-live="polite" style={{ position: 'absolute', left: '50%', bottom: 72, width: 720, transform: 'translateX(-50%)', margin: 0, padding: '11px 18px', borderRadius: 8, background: 'rgba(10,12,16,0.72)', textAlign: 'center', fontSize: 17, textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{view.narrationLines[narrationLineIndex]}</p>}
    </div>
  )
}
