import { t, type IpMode } from '../../game/i18n.ts'

export interface RewardPresentation {
  id: 'currency' | 'exp' | 'ribbon'
  text: string
  iconUrl: string
}

export interface RewardPopupPresentation {
  title: string
  rewards: RewardPresentation[]
  showLevelUp: boolean
  levelUpText: 'LEVEL UP'
}

export function rewardPopupPresentation(
  ipMode: IpMode,
  previousLevel: number,
  currentLevel: number,
): RewardPopupPresentation {
  return {
    title: t('s09.reward.title', ipMode),
    rewards: [
      { id: 'currency', text: t('s09.reward.currency', ipMode), iconUrl: '/ui/items/itm-meso.png' },
      { id: 'exp', text: t('s09.reward.exp', ipMode), iconUrl: '/ui/items/ui-star.png' },
      { id: 'ribbon', text: t('s09.reward.ribbon', ipMode), iconUrl: '/ui/items/itm-pigribbon.png' },
    ],
    showLevelUp: currentLevel > previousLevel,
    levelUpText: 'LEVEL UP',
  }
}
