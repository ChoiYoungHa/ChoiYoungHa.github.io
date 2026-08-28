import { t, type IpMode } from '../../game/i18n.ts'
import rawItems from '../../game/data/items.json' with { type: 'json' }
import { effectiveBonuses, type Inventory, type ItemDefinition } from '../../game/rules/inventory.ts'
import { expRequiredForLevel } from '../../game/rules/stats.ts'
import { HUD_TOKENS } from './hudTokens.ts'

/**
 * 2026-08-28 (영하님) — 스탯창. `C` 키(입력 액션 'stats')로 토글, Esc 로 닫힘. `S` 는 WASD 후진과 충돌해 C 를 쓴다.
 * 순수 표시 컴포넌트: 값은 GameState(레벨·HP/MP·EXP·메소)와 인벤토리 보너스에서 온다.
 */
const ITEM_BY_ID: Record<string, ItemDefinition> = Object.fromEntries((rawItems as unknown as ItemDefinition[]).map((item) => [item.id, item]))

export interface StatsPanelProps {
  open: boolean
  name: string
  jobLabel: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  exp: number
  meso: number
  killCount: number
  inventory: Inventory
  ipMode: IpMode
  onClose: () => void
}

export function statsRows(p: Pick<StatsPanelProps, 'level' | 'hp' | 'maxHp' | 'mp' | 'maxMp' | 'exp' | 'meso' | 'killCount' | 'inventory'>): Array<[string, string]> {
  const bonuses = effectiveBonuses(p.inventory, ITEM_BY_ID)
  const required = expRequiredForLevel(p.level)
  return [
    ['레벨', String(p.level)],
    ['HP', `${p.hp} / ${p.maxHp}`],
    ['MP', `${p.mp} / ${p.maxMp}`],
    ['EXP', `${p.exp} / ${required} (${Math.round((p.exp / required) * 100)}%)`],
    ['공격력', `+${bonuses.attack ?? 0}`],
    ['마력', `+${bonuses.magic ?? 0}`],
    ['방어력', `+${bonuses.defense ?? 0}`],
    ['메소', p.meso.toLocaleString('ko-KR')],
    ['처치', `${p.killCount}`],
  ]
}

export function StatsPanel(props: StatsPanelProps) {
  if (!props.open) return null
  const rows = statsRows(props)
  return (
    <section aria-label="스탯창" style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', width: 260, padding: 14, borderRadius: 10, background: HUD_TOKENS.colors.panelStrong, border: `1px solid ${HUD_TOKENS.colors.border}`, color: HUD_TOKENS.colors.text, fontFamily: HUD_TOKENS.fontFamily, pointerEvents: 'auto', ...HUD_TOKENS.borderImage.panel }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>{t('s08.stats', props.ipMode)}</strong>
        <button type="button" onClick={props.onClose} aria-label="스탯창 닫기" style={{ background: 'transparent', border: 'none', color: HUD_TOKENS.colors.muted, cursor: 'pointer', fontSize: 12 }}>C / Esc</button>
      </header>
      <div style={{ fontSize: 13, marginBottom: 8 }}><span style={{ color: '#f0c55b' }}>{props.name}</span> <span style={{ color: HUD_TOKENS.colors.muted }}>· {props.jobLabel}</span></div>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 13 }}>
          <span style={{ color: HUD_TOKENS.colors.muted }}>{label}</span><span>{value}</span>
        </div>
      ))}
    </section>
  )
}
