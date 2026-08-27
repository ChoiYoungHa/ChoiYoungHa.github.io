import { t, type IpMode } from '../../game/i18n.ts'
import iconData from '../../game/data/itemIcons.json' with { type: 'json' }
import type { QuestStatus } from '../../game/rules/quest.ts'
import type { ZoneId } from '../../game/world/zones.ts'

export const HUD_ICON_URLS = iconData.hud

export interface HudPresentationInput {
  dialogueOpen: boolean
  zone: ZoneId
  questStatus: QuestStatus
}

export interface HudPresentation {
  showStats: boolean
  showQuestTracker: boolean
  showQuickSlots: boolean
  showMeso: boolean
}

export function hudPresentation(input: HudPresentationInput): HudPresentation {
  return {
    showStats: !input.dialogueOpen,
    showQuestTracker: input.questStatus === 'active' || input.questStatus === 'ready',
    showQuickSlots: input.zone === 'park',
    showMeso: true,
  }
}

export function barPercent(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return 0
  return Math.max(0, Math.min(100, (value / maximum) * 100))
}

export const cooldownPercent = barPercent

export interface HudLabels {
  questTitle: string
  questProgress: string
  currency: string
}

export function hudLabels(ipMode: IpMode, killCount: number): HudLabels {
  const progressTemplate = t('s07.questTracker', ipMode)
  const monsterName = progressTemplate.split(/\s+/u)[0]
  const safeKillCount = Math.max(0, Math.min(10, Math.trunc(killCount)))
  return {
    questTitle: `(Lv.10) ${monsterName} 사냥`,
    questProgress: progressTemplate.replace(/\d+\s*\/\s*10/u, `${safeKillCount}/10`),
    currency: t('s09.reward.currency', ipMode).split(/\s+/u)[0],
  }
}
