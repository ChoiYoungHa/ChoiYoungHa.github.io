import { t, type IpMode } from '../../game/i18n.ts'
import type { QuestStatus } from '../../game/rules/quest.ts'
import type { ZoneId } from '../../game/world/zones.ts'
import { barPercent, cooldownPercent, hudLabels, hudPresentation } from './hudLogic.ts'
import { HUD_TOKENS } from './hudTokens.ts'

export interface HudStats {
  level: number
  name: string
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  exp: number
  expRequired: number
}

export interface HudQuest {
  status: QuestStatus
  killCount: number
}

export interface HudQuickSlot {
  slot: number
  labelKey?: string
  iconUrl?: string
  cooldownRemainingMs: number
  cooldownTotalMs: number
}

export interface GameHudProps {
  stats: HudStats
  quest: HudQuest
  zone: ZoneId
  dialogueOpen: boolean
  meso: number
  ipMode: IpMode
  quickSlots?: readonly HudQuickSlot[]
}

const DEFAULT_SLOTS: readonly HudQuickSlot[] = [
  { slot: 1, labelKey: 's07.attack', cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 2, labelKey: 's07.skill', cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 3, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 4, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
]

function StatBar({ label, value, maximum, color }: {
  label: string
  value: number
  maximum: number
  color: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 6, alignItems: 'center', fontSize: 10 }}>
      <span style={{ color: HUD_TOKENS.colors.muted }}>{label}</span>
      <div style={{ height: 7, overflow: 'hidden', borderRadius: 4, background: 'rgba(255,255,255,0.12)' }}>
        <div style={{ width: `${barPercent(value, maximum)}%`, height: '100%', background: color }} />
      </div>
    </div>
  )
}

export function GameHud({ stats, quest, zone, dialogueOpen, meso, ipMode, quickSlots = DEFAULT_SLOTS }: GameHudProps) {
  const visibility = hudPresentation({ dialogueOpen, zone, questStatus: quest.status })
  const labels = hudLabels(ipMode, quest.killCount)
  const panelBase = {
    boxSizing: 'border-box' as const,
    border: `1px solid ${HUD_TOKENS.colors.border}`,
    borderRadius: 8,
    background: HUD_TOKENS.colors.panel,
    color: HUD_TOKENS.colors.text,
    boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
  }

  return (
    <div aria-label="게임 HUD" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: HUD_TOKENS.fontFamily }}>
      {visibility.showStats && (
        <section aria-label="캐릭터 상태" style={{ ...panelBase, position: 'absolute', ...HUD_TOKENS.layout.stats, padding: '8px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12, fontWeight: 700 }}>
            <span>Lv.{stats.level} {stats.name}</span>
            <span style={{ color: HUD_TOKENS.colors.muted, fontSize: 10 }}>{Math.max(0, Math.round(stats.hp))}/{stats.maxHp}</span>
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            <StatBar label="HP" value={stats.hp} maximum={stats.maxHp} color={HUD_TOKENS.colors.hp} />
            <StatBar label="MP" value={stats.mp} maximum={stats.maxMp} color={HUD_TOKENS.colors.mp} />
            <StatBar label="EXP" value={stats.exp} maximum={stats.expRequired} color={HUD_TOKENS.colors.exp} />
          </div>
        </section>
      )}

      {visibility.showQuestTracker && (
        <section aria-label="퀘스트 추적" style={{ ...panelBase, position: 'absolute', ...HUD_TOKENS.layout.quest, padding: '10px 14px' }}>
          <strong style={{ display: 'block', fontSize: 13 }}>{labels.questTitle}</strong>
          <span style={{ display: 'block', marginTop: 6, color: HUD_TOKENS.colors.muted, fontSize: 12 }}>{labels.questProgress}</span>
        </section>
      )}

      {visibility.showQuickSlots && (
        <section aria-label="퀵슬롯" style={{ position: 'absolute', ...HUD_TOKENS.layout.quick, display: 'flex', gap: 6 }}>
          {quickSlots.slice(0, 4).map((slot) => {
            const cooldown = cooldownPercent(slot.cooldownRemainingMs, slot.cooldownTotalMs)
            return (
              <div key={slot.slot} style={{ ...panelBase, position: 'relative', width: HUD_TOKENS.layout.quickSlotSize, height: HUD_TOKENS.layout.quickSlotSize, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
                {slot.iconUrl ? <img src={slot.iconUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : (
                  <span style={{ maxWidth: 42, textAlign: 'center', fontSize: 9, lineHeight: 1.15, color: HUD_TOKENS.colors.muted }}>
                    {slot.labelKey ? t(slot.labelKey, ipMode) : '—'}
                  </span>
                )}
                <span style={{ position: 'absolute', left: 4, top: 3, fontSize: 9, color: HUD_TOKENS.colors.text }}>{slot.slot}</span>
                {cooldown > 0 && <span aria-label={`쿨다운 ${Math.round(cooldown)}%`} style={{ position: 'absolute', inset: `${100 - cooldown}% 0 0`, background: HUD_TOKENS.colors.cooldown }} />}
              </div>
            )
          })}
        </section>
      )}

      {visibility.showMeso && (
        <div aria-label={`${labels.currency} ${meso}`} style={{ ...panelBase, position: 'absolute', ...HUD_TOKENS.layout.meso, minWidth: 132, padding: '9px 14px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>
          {labels.currency} {Math.max(0, Math.trunc(meso)).toLocaleString('ko-KR')}
        </div>
      )}
    </div>
  )
}
