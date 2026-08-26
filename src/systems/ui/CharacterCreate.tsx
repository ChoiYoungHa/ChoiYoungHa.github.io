import type { IpMode } from '../../game/i18n.ts'
import { Portrait } from './Portrait.tsx'
import type { PortraitSelection } from '../../game/portrait/compose.ts'
import type { JobId } from '../../game/state.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import {
  characterCreatePresentation,
  type CharacterCreateSelection,
  type PortraitPartKey,
} from './characterCreateLogic.ts'

const PART_CONTROLS: ReadonlyArray<{ key: PortraitPartKey, label: string }> = [
  { key: 'faceId', label: '얼굴' }, { key: 'eyeId', label: '눈' },
  { key: 'noseId', label: '코' }, { key: 'mouthId', label: '입' },
  { key: 'hairId', label: '머리' }, { key: 'skinId', label: '피부' },
  { key: 'hairColorId', label: '머리색' }, { key: 'eyeColorId', label: '눈동자' },
]

export interface CharacterCreateProps {
  name: string
  selectedJobId: JobId
  portrait: PortraitSelection
  ipMode: IpMode
  onNameChange: (name: string) => void
  onSelectJob: (jobId: JobId) => void
  onPrev: () => void
  onNext: () => void
  onCyclePart: (partKey: PortraitPartKey, direction: -1 | 1) => void
  onRandom: () => void
  onConfirm: (selection: CharacterCreateSelection) => void
}

export function CharacterCreate({ name, selectedJobId, portrait, ipMode, onNameChange, onSelectJob, onPrev, onNext, onCyclePart, onRandom, onConfirm }: CharacterCreateProps) {
  const view = characterCreatePresentation(name, selectedJobId, ipMode)
  const displayPortrait = { ...portrait, outfitId: selectedJobId }
  return (
    <section aria-label={view.title} style={{ position: 'absolute', inset: 0, padding: '28px 34px', boxSizing: 'border-box', background: 'linear-gradient(135deg, rgba(20,26,29,0.94), rgba(42,37,34,0.9))', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto' }}>
      <h1 style={{ margin: '0 0 18px', textAlign: 'center', fontSize: 28 }}>{view.title}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 24 }}>
        <aside style={{ padding: 14, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 12, background: HUD_TOKENS.colors.panel }}>
          <div style={{ display: 'grid', placeItems: 'center', height: 210 }}><Portrait selection={displayPortrait} size={205} /></div>
          <label style={{ display: 'grid', gap: 5, marginBottom: 12 }}><span>{view.nameLabel}</span><input value={name} maxLength={9} placeholder={view.namePlaceholder} onChange={(event) => onNameChange(event.target.value)} style={{ border: `1px solid ${view.nameError === null ? HUD_TOKENS.colors.border : '#d87367'}`, borderRadius: 6, padding: '9px 10px', background: 'rgba(0,0,0,0.25)', color: HUD_TOKENS.colors.text, font: 'inherit' }} />{view.nameError !== null && <small style={{ color: '#e38b81' }}>{view.nameError}</small>}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
            {PART_CONTROLS.map((part) => <div key={part.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 24px', alignItems: 'center', gap: 3 }}><button type="button" onClick={() => onCyclePart(part.key, -1)}>‹</button><small style={{ textAlign: 'center' }}>{part.label}</small><button type="button" onClick={() => onCyclePart(part.key, 1)}>›</button></div>)}
          </div>
          <button type="button" onClick={onRandom} style={{ width: '100%', marginTop: 10 }}>{view.randomLabel}</button>
        </aside>
        <main style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(4, 1fr) 36px', alignItems: 'center', gap: 10 }}>
            <button type="button" onClick={onPrev} aria-label="이전 직업">←</button>
            {view.jobs.map((job) => <button key={job.id} type="button" onClick={() => onSelectJob(job.id)} style={{ height: 260, border: `2px solid ${job.selected ? job.color : HUD_TOKENS.colors.border}`, borderRadius: 12, padding: 14, background: `linear-gradient(180deg, ${job.color}33, rgba(15,17,21,0.92))`, boxShadow: job.selected ? `0 0 22px ${job.color}88` : undefined, filter: job.selected ? undefined : 'brightness(0.6) saturate(0.6)', color: HUD_TOKENS.colors.text, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
              <strong style={{ display: 'block', color: job.color, fontSize: 21 }}>{job.name}</strong>
              <p style={{ minHeight: 48, lineHeight: 1.45 }}>{job.description}</p>
              <small style={{ display: 'block', lineHeight: 1.7 }}>HP {job.startStats.hp}<br />MP {job.startStats.mp}<br />공격 {job.startStats.attack}</small>
              <span style={{ display: 'block', marginTop: 12, color: '#e6cb8d' }}>{job.skillName}</span>
            </button>)}
            <button type="button" onClick={onNext} aria-label="다음 직업">→</button>
          </div>
          <button type="button" disabled={!view.canConfirm} onClick={() => onConfirm({ name, jobId: selectedJobId, portrait: displayPortrait })} style={{ alignSelf: 'center', minWidth: 190, marginTop: 26, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: '12px 24px', background: view.canConfirm ? '#7b612d' : '#34353b', color: view.canConfirm ? '#fff7dc' : '#85858b', cursor: view.canConfirm ? 'pointer' : 'not-allowed', font: 'inherit', fontWeight: 700 }}>{view.confirmLabel}</button>
        </main>
      </div>
    </section>
  )
}
