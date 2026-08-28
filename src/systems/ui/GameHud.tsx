import { useState } from 'react'
import { t, type IpMode } from '../../game/i18n.ts'
import type { QuestStatus } from '../../game/rules/quest.ts'
import type { ZoneId } from '../../game/world/zones.ts'
import { barPercent, cooldownPercent, HUD_ICON_URLS, hudLabels, hudPresentation } from './hudLogic.ts'
import { HUD_TOKENS } from './hudTokens.ts'
import { MiniMap, type MiniMapProps } from './MiniMap.tsx'

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
  /** 2026-08-28 — 등록된 소비 아이템 id(3~6). 드래그로 다른 슬롯에 옮기거나 밖에 놓아 해제한다. */
  itemId?: string
  /** 2026-08-28 — 소비 아이템 슬롯의 보유 수량(배지). */
  quantity?: number
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
  minimap?: MiniMapProps
  /** 2026-08-28 — 인벤토리에서 소비 아이템을 퀵슬롯 3~6 에 드롭. 있으면 퀵슬롯이 포인터 이벤트를 받는다. */
  onBindQuickSlot?: (itemId: string, slot: 3 | 4 | 5 | 6) => void
  /** 퀵슬롯 아이템을 슬롯 밖에 놓으면 해제. */
  onUnbindQuickSlot?: (slot: 3 | 4 | 5 | 6) => void
}

const BINDABLE_SLOTS: ReadonlySet<number> = new Set([3, 4, 5, 6])
const isBindableSlot = (slot: number): slot is 3 | 4 | 5 | 6 => BINDABLE_SLOTS.has(slot)

const DEFAULT_SLOTS: readonly HudQuickSlot[] = [
  { slot: 1, labelKey: 's07.attack', iconUrl: HUD_ICON_URLS.basicAttack, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 2, labelKey: 's07.skill', iconUrl: HUD_ICON_URLS.skill, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 3, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 4, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 5, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
  { slot: 6, cooldownRemainingMs: 0, cooldownTotalMs: 0 },
]

function StatBar({ label, value, maximum, color, text }: {
  label: string
  value: number
  maximum: number
  color: string
  text?: string
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 6, alignItems: 'center', fontSize: 10 }}>
      <span style={{ color: HUD_TOKENS.colors.muted, fontWeight: 700 }}>{label}</span>
      <div style={{ position: 'relative', height: text === undefined ? 7 : 14, overflow: 'hidden', borderRadius: 4, background: 'rgba(255,255,255,0.12)' }}>
        <div style={{ width: `${barPercent(value, maximum)}%`, height: '100%', background: color }} />
        {text !== undefined && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>{text}</span>}
      </div>
    </div>
  )
}

export function GameHud({ stats, quest, zone, dialogueOpen, meso, ipMode, quickSlots = DEFAULT_SLOTS, minimap, onBindQuickSlot, onUnbindQuickSlot }: GameHudProps) {
  const visibility = hudPresentation({ dialogueOpen, zone, questStatus: quest.status })
  const labels = hudLabels(ipMode, quest.killCount)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)
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
        <section aria-label="캐릭터 상태" style={{ ...panelBase, position: 'absolute', left: HUD_TOKENS.layout.stats.left, bottom: HUD_TOKENS.layout.stats.bottom, width: HUD_TOKENS.layout.stats.width, transform: 'translateX(-50%)', padding: '8px 12px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
            <span style={{ color: '#e8c37a' }}>Lv.{stats.level}</span>
            <span>{stats.name}</span>
          </div>
          <div style={{ display: 'grid', gap: 5 }}>
            <StatBar label="HP" value={stats.hp} maximum={stats.maxHp} color={HUD_TOKENS.colors.hp} text={`${Math.max(0, Math.round(stats.hp))} / ${stats.maxHp}`} />
            <StatBar label="MP" value={stats.mp} maximum={stats.maxMp} color={HUD_TOKENS.colors.mp} text={`${Math.max(0, Math.round(stats.mp))} / ${stats.maxMp}`} />
            <StatBar label="EXP" value={stats.exp} maximum={stats.expRequired} color={HUD_TOKENS.colors.exp} text={`${Math.floor(barPercent(stats.exp, stats.expRequired))}%`} />
          </div>
        </section>
      )}

      {minimap !== undefined && !dialogueOpen && <MiniMap {...minimap} />}

      {visibility.showQuestTracker && (
        <section aria-label="퀘스트 추적" style={{ ...panelBase, position: 'absolute', ...HUD_TOKENS.layout.quest, padding: '10px 14px' }}>
          <strong style={{ display: 'block', fontSize: 13 }}>{labels.questTitle}</strong>
          <span style={{ display: 'block', marginTop: 6, color: HUD_TOKENS.colors.muted, fontSize: 12 }}>{labels.questProgress}</span>
        </section>
      )}

      {visibility.showMeso && (
        <div aria-label="키 안내" style={{ position: 'absolute', right: HUD_TOKENS.layout.meso.right, bottom: HUD_TOKENS.layout.meso.bottom + 46, textAlign: 'right', fontSize: 10, lineHeight: 1.5, letterSpacing: 0.3, whiteSpace: 'nowrap', color: HUD_TOKENS.colors.muted, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {/* 2026-08-28 영하님: 기본 단축키 안내는 오른쪽 하단(메소 위)에 작게. */}
          WASD 이동 · Shift 달리기 · Space 점프 · F 대화<br />
          1 공격(꾹) · 2 스킬 · 3~6 아이템 · I 아이템 · C 스탯 · Esc 닫기
        </div>
      )}
      {visibility.showQuickSlots && (
        <section aria-label="퀵슬롯" style={{ position: 'absolute', ...HUD_TOKENS.layout.quick, display: 'flex', gap: 6, pointerEvents: onBindQuickSlot === undefined ? 'none' : 'auto' }}>
          {quickSlots.slice(0, 6).map((slot) => {
            const cooldown = cooldownPercent(slot.cooldownRemainingMs, slot.cooldownTotalMs)
            const droppable = onBindQuickSlot !== undefined && isBindableSlot(slot.slot)
            const dragOver = droppable && dragOverSlot === slot.slot
            return (
              <div
                key={slot.slot}
                aria-label={`퀵슬롯 ${slot.slot}`}
                draggable={droppable && slot.itemId !== undefined}
                onDragStart={(event) => {
                  if (slot.itemId === undefined) { event.preventDefault(); return }
                  event.dataTransfer.setData('text/plain', slot.itemId)
                  event.dataTransfer.effectAllowed = 'copyMove'
                }}
                onDragEnd={(event) => {
                  // 유효한 드롭 대상 밖에 놓으면(dropEffect none) 슬롯을 비운다.
                  if (event.dataTransfer.dropEffect === 'none' && isBindableSlot(slot.slot)) onUnbindQuickSlot?.(slot.slot)
                }}
                onDragOver={(event) => { if (!droppable) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (dragOverSlot !== slot.slot) setDragOverSlot(slot.slot) }}
                onDragLeave={() => { if (dragOverSlot === slot.slot) setDragOverSlot(null) }}
                onDrop={(event) => {
                  if (!droppable || !isBindableSlot(slot.slot)) return
                  event.preventDefault()
                  setDragOverSlot(null)
                  const itemId = event.dataTransfer.getData('text/plain')
                  if (itemId !== '' && itemId !== slot.itemId) onBindQuickSlot?.(itemId, slot.slot)
                }}
                style={{ ...panelBase, position: 'relative', width: HUD_TOKENS.layout.quickSlotSize, height: HUD_TOKENS.layout.quickSlotSize, overflow: 'hidden', display: 'grid', placeItems: 'center', cursor: slot.itemId !== undefined ? 'grab' : undefined, ...(dragOver ? { borderColor: '#f0c55b', boxShadow: '0 0 0 2px rgba(240,197,91,0.55)' } : {}) }}
              >
                {slot.iconUrl ? <img src={slot.iconUrl} alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} /> : (
                  <span style={{ maxWidth: 42, textAlign: 'center', fontSize: 9, lineHeight: 1.15, color: HUD_TOKENS.colors.muted }}>
                    {slot.labelKey ? t(slot.labelKey, ipMode) : '—'}
                  </span>
                )}
                <span style={{ position: 'absolute', left: 4, top: 3, fontSize: 9, color: HUD_TOKENS.colors.text }}>{slot.slot}</span>
                {slot.quantity !== undefined && <span aria-label={`수량 ${slot.quantity}`} style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, fontWeight: 700, color: slot.quantity > 0 ? '#f0c55b' : '#b05050' }}>{slot.quantity}</span>}
                {cooldown > 0 && <span aria-label={`쿨다운 ${Math.round(cooldown)}%`} style={{ position: 'absolute', inset: `${100 - cooldown}% 0 0`, background: HUD_TOKENS.colors.cooldown }} />}
              </div>
            )
          })}
        </section>
      )}

      {visibility.showMeso && (
        <div aria-label={`${labels.currency} ${meso}`} style={{ ...panelBase, position: 'absolute', ...HUD_TOKENS.layout.meso, minWidth: 132, padding: '7px 14px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}>
          <img src={HUD_ICON_URLS.meso} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          {Math.max(0, Math.trunc(meso)).toLocaleString('ko-KR')}
        </div>
      )}
    </div>
  )
}
