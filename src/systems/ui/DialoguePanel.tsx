import type { DialogueState } from '../../game/dialogue.ts'
import type { IpMode } from '../../game/i18n.ts'
import { Portrait } from '../../game/portrait/Portrait.tsx'
import type { PortraitSelection } from '../../game/portrait/compose.ts'
import { acceptFlashVisible, dialoguePanelPresentation } from './dialoguePanelLogic.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import styles from './DialoguePanel.module.css'

export interface DialoguePanelProps {
  state: DialogueState
  ipMode: IpMode
  onAdvance: () => void
  onChoose: (choiceId: string) => void
  portraitSelection?: PortraitSelection
  npcImageUrl?: string
  acceptedAtMs?: number
  nowMs?: number
}

export function DialoguePanel({
  state,
  ipMode,
  onAdvance,
  onChoose,
  portraitSelection,
  npcImageUrl,
  acceptedAtMs,
  nowMs = acceptedAtMs ?? 0,
}: DialoguePanelProps) {
  const view = dialoguePanelPresentation(state, ipMode)
  if (!view.visible) return null
  const flashAccepted = acceptFlashVisible(acceptedAtMs, nowMs)

  return (
    <section
      aria-label="대화"
      className={`${styles.panel}${flashAccepted ? ` ${styles.accepted}` : ''}`}
      onClick={view.choices.length === 0 ? onAdvance : undefined}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        width: 880,
        height: 160,
        transform: 'translateX(-50%)',
        display: 'grid',
        gridTemplateColumns: '128px 1fr',
        gap: 18,
        padding: 14,
        color: HUD_TOKENS.colors.text,
        fontFamily: HUD_TOKENS.fontFamily,
        pointerEvents: 'auto',
        cursor: view.choices.length === 0 ? 'pointer' : 'default',
      }}
    >
      <div aria-label="초상" style={{ display: 'grid', placeItems: 'center', overflow: 'hidden', border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, background: 'rgba(255,255,255,0.05)' }}>
        {portraitSelection !== undefined ? <Portrait selection={portraitSelection} size={124} /> : npcImageUrl !== undefined ? (
          <img src={npcImageUrl} alt="NPC 초상" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : <span style={{ color: HUD_TOKENS.colors.muted, fontSize: 12 }}>NPC</span>}
      </div>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {view.speaker.length > 0 && <strong style={{ color: '#f2cc75', fontSize: 15 }}>{view.speaker}</strong>}
        <p style={{ flex: 1, margin: view.speaker.length > 0 ? '9px 0 6px' : '4px 0 6px', fontSize: 15, lineHeight: 1.55 }}>{view.body}</p>
        {view.choices.length > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {view.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onChoose(choice.id)
                }}
                style={{ border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 6, padding: '7px 14px', background: HUD_TOKENS.colors.panelStrong, color: HUD_TOKENS.colors.text, font: 'inherit', cursor: 'pointer' }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        ) : <span style={{ alignSelf: 'flex-end', color: HUD_TOKENS.colors.muted, fontSize: 11 }}>클릭하여 계속</span>}
      </div>
    </section>
  )
}
