import type { IpMode } from '../../game/i18n.ts'
import type { LoadingState } from '../loading.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import styles from './TitleScreen.module.css'
import { titlePresentation } from './titleLogic.ts'

export interface TitleScreenProps {
  bgUrl?: string
  loading: LoadingState
  backend: string
  preset: string
  ipMode: IpMode
  onStart: () => void
}

export function TitleScreen({ bgUrl, loading, backend, preset, ipMode, onStart }: TitleScreenProps) {
  const view = titlePresentation(loading, ipMode)
  const backgroundImage = bgUrl === undefined
    ? 'radial-gradient(circle at 50% 28%, #52604f 0%, #29352f 38%, #101719 100%)'
    : `linear-gradient(180deg, rgba(10,14,15,0.12), rgba(8,10,12,0.76)), url("${bgUrl}")`
  return (
    <section aria-label="타이틀" style={{ position: 'absolute', inset: 0, overflow: 'hidden', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily }}>
      <div className={styles.background} aria-hidden="true" style={{ position: 'absolute', inset: '-4%', backgroundImage, backgroundPosition: 'center', backgroundSize: 'cover' }} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '15vh', boxSizing: 'border-box', textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 10, color: '#c8aa69', fontSize: 12, letterSpacing: '0.48em' }}>{view.kicker}</div>
          <h1 style={{ margin: 0, fontSize: 56, letterSpacing: '0.1em', textShadow: '0 4px 24px rgba(0,0,0,0.72)' }}>{view.title}</h1>
          <strong style={{ display: 'block', marginTop: 10, color: '#e8c37a', fontSize: 24, letterSpacing: '0.3em' }}>{view.subtitle}</strong>
        </div>
        <div style={{ width: 300, marginTop: 34 }}>
          <div style={{ height: 4, overflow: 'hidden', borderRadius: 99, background: 'rgba(0,0,0,0.58)' }}><div style={{ width: `${view.progress}%`, height: '100%', background: '#e8c37a', transition: 'width 300ms ease' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7, color: '#b5ae9e', fontSize: 10 }}><span>{view.phaseLabel}</span><span>{view.progress}%</span></div>
        </div>
        <button type="button" disabled={!view.canStart} onClick={onStart} style={{ marginTop: 24, minWidth: 180, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, padding: '12px 24px', background: view.canStart ? '#80652f' : '#313238', color: view.canStart ? '#fff7dc' : '#85858b', cursor: view.canStart ? 'pointer' : 'not-allowed', font: 'inherit', fontWeight: 700 }}>{view.startLabel}</button>
      </div>
      <div style={{ position: 'absolute', left: 14, bottom: 12, color: '#8f8a80', fontSize: 10, lineHeight: 1.7, letterSpacing: '0.06em' }}>RENDERER · {backend}<br />PRESET · {preset}</div>
    </section>
  )
}
