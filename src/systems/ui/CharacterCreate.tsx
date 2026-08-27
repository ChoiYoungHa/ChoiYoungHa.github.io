import type { IpMode } from '../../game/i18n.ts'
import { Portrait } from './Portrait.tsx'
import type { PortraitSelection } from '../../game/portrait/compose.ts'
import type { JobId } from '../../game/state.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { characterCreatePresentation, type PortraitPartKey } from './characterCreateLogic.ts'

/**
 * S01 캐릭터 생성 — 2026-08-27 영하님: 직업은 전사 고정이므로 이름만 입력한다.
 * 얼굴 파츠 커스텀·랜덤·직업 넘김은 제거했고(props 는 호환을 위해 남김), 전사 카드 1장을 가운데 정렬한다.
 */
export interface CharacterCreateProps {
  name: string
  selectedJobId: JobId
  portrait: PortraitSelection
  ipMode: IpMode
  onNameChange: (name: string) => void
  onSelectJob: (jobId: JobId) => void
  onPrev?: () => void
  onNext?: () => void
  onCyclePart?: (part: PortraitPartKey, direction: 1 | -1) => void
  onRandom?: () => void
  onConfirm: (selection: { name: string; jobId: JobId; portrait: PortraitSelection }) => void
}

export function CharacterCreate({ name, selectedJobId, portrait, ipMode, onNameChange, onSelectJob, onConfirm }: CharacterCreateProps) {
  const view = characterCreatePresentation(name, selectedJobId, ipMode)
  const displayPortrait = { ...portrait, outfitId: selectedJobId }
  const job = view.jobs.find((candidate) => candidate.id === selectedJobId) ?? view.jobs[0]
  const confirm = () => { if (view.canConfirm) onConfirm({ name, jobId: selectedJobId, portrait: displayPortrait }) }
  return (
    <section aria-label={view.title} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', boxSizing: 'border-box', padding: 24, background: 'linear-gradient(135deg, rgba(20,26,29,0.94), rgba(42,37,34,0.9))', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto' }}>
      <div style={{ width: 'min(560px, 100%)', display: 'grid', gap: 18, justifyItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '0.08em' }}>{view.title}</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 18, width: '100%', alignItems: 'stretch' }}>
          <aside style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: 14, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 12, background: HUD_TOKENS.colors.panel }}>
            <Portrait selection={displayPortrait} imageUrl="/ui/portraits/player-warrior.png" size={160} />
            <label style={{ display: 'grid', gap: 5, width: '100%' }}>
              <span style={{ fontSize: 12, color: HUD_TOKENS.colors.muted }}>{view.nameLabel}</span>
              <input
                data-testid="create-name"
                value={name}
                maxLength={9}
                placeholder={view.namePlaceholder}
                autoFocus
                onChange={(event) => onNameChange(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') confirm() }}
                style={{ padding: '8px 10px', border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, background: 'rgba(0,0,0,0.35)', color: HUD_TOKENS.colors.text, font: 'inherit', fontSize: 15 }}
              />
            </label>
          </aside>

          {job !== undefined && (
            <button
              type="button"
              data-testid="create-job-warrior"
              onClick={() => onSelectJob(job.id)}
              style={{ border: `2px solid ${job.color}`, borderRadius: 12, padding: 18, background: `linear-gradient(180deg, ${job.color}33, rgba(15,17,21,0.92))`, boxShadow: `0 0 22px ${job.color}66`, color: HUD_TOKENS.colors.text, textAlign: 'left', cursor: 'default', font: 'inherit' }}
            >
              <strong style={{ display: 'block', color: job.color, fontSize: 24 }}>{job.name}</strong>
              <p style={{ margin: '10px 0 14px', lineHeight: 1.5 }}>{job.description}</p>
              <small style={{ display: 'block', lineHeight: 1.8, fontSize: 12 }}>HP {job.startStats.hp}<br />MP {job.startStats.mp}<br />공격 {job.startStats.attack}</small>
              <span style={{ display: 'block', marginTop: 12, color: '#e6cb8d' }}>{job.skillName}</span>
            </button>
          )}
        </div>

        <button
          type="button"
          data-testid="create-confirm"
          disabled={!view.canConfirm}
          onClick={confirm}
          style={{ minWidth: 220, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: '12px 24px', background: view.canConfirm ? '#7b612d' : '#34353b', color: view.canConfirm ? '#fff7dc' : '#85858b', cursor: view.canConfirm ? 'pointer' : 'not-allowed', font: 'inherit', fontWeight: 700, fontSize: 16 }}
        >
          {view.confirmLabel}
        </button>
      </div>
    </section>
  )
}
