import type { SessionSnapshot } from '../../game/session.ts'
import { HUD_TOKENS } from './hudTokens.ts'

/** 2026-08-28 — 보스 HP 바(상단 중앙, 각성 중에만) + 보스 배너(각성/격파 4초). */
export function BossBar({ boss }: { boss: SessionSnapshot['boss'] }) {
  if (boss === null || boss.state === 'dead') return null
  const percent = boss.maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100))
  return (
    <section aria-label={`보스 체력 ${Math.round(percent)}%`} style={{ position: 'absolute', top: 18, left: '50%', width: 520, transform: 'translateX(-50%)', fontFamily: HUD_TOKENS.fontFamily, color: HUD_TOKENS.colors.text, pointerEvents: 'none', textShadow: '0 2px 8px rgba(0,0,0,0.85)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <strong style={{ fontSize: 16, letterSpacing: '0.08em', color: '#f3c6d3' }}>{boss.name}</strong>
        <span style={{ fontSize: 12, color: HUD_TOKENS.colors.muted }}>{boss.hp} / {boss.maxHp}</span>
      </div>
      <div style={{ height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.75)', background: 'rgba(10,10,14,0.8)', boxShadow: '0 0 0 1px rgba(243,198,211,0.35)' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg, #b5324e, #e46b86)', transition: 'width 120ms linear' }} />
      </div>
    </section>
  )
}

export function BossBanner({ banner }: { banner: SessionSnapshot['bossBanner'] }) {
  if (banner === null) return null
  return (
    <section aria-live="polite" aria-label="보스 배너" style={{ position: 'absolute', top: 120, left: '50%', width: 560, transform: 'translateX(-50%)', textAlign: 'center', color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'none', textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
      <strong style={{ display: 'block', fontSize: 38, lineHeight: 1.15, letterSpacing: '0.12em', color: '#f3c6d3' }}>{banner.title}</strong>
      <span style={{ display: 'block', marginTop: 6, fontSize: 14, letterSpacing: '0.1em', color: '#e8d5ad' }}>{banner.subtitle}</span>
      <span aria-hidden="true" style={{ display: 'block', width: 160, height: 1, margin: '10px auto 0', background: 'linear-gradient(90deg, transparent, #e46b86, transparent)' }} />
    </section>
  )
}
