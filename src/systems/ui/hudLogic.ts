import { t, type IpMode } from '../../game/i18n.ts'
import iconData from '../../game/data/itemIcons.json' with { type: 'json' }
import type { QuestStatus } from '../../game/rules/quest.ts'
import type { ZoneId } from '../../game/world/zones.ts'

export const HUD_ICON_URLS = iconData.hud

export interface HudPresentationInput {
  dialogueOpen: boolean
  zone: ZoneId
  questStatus: QuestStatus
  /** 마을 입구 게이트를 통과했는가(씬 henesys 이후). 게이트 주변은 지역 판정상 아직 '숲'이라 zone 만으로는 목표를 못 띄운다. */
  enteredVillage?: boolean
}

export interface HudPresentation {
  showStats: boolean
  showQuestTracker: boolean
  showQuickSlots: boolean
  showMeso: boolean
  /** 2026-08-28 영하님 — 마을에 들어왔는데 아직 퀘스트를 받지 않았으면 "촌장을 찾아가세요" 목표를 퀘스트 자리에 보인다. */
  showObjective: boolean
}

export function hudPresentation(input: HudPresentationInput): HudPresentation {
  return {
    showStats: !input.dialogueOpen,
    showQuestTracker: input.questStatus === 'active' || input.questStatus === 'ready',
    showQuickSlots: !input.dialogueOpen, // 2026-08-27 영하님 피드백: 공원 밖에서도 스킬바가 보여야 한다
    showMeso: true,
    showObjective: !input.dialogueOpen && input.questStatus === 'none' && (input.zone === 'village' || input.enteredVillage === true),
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
