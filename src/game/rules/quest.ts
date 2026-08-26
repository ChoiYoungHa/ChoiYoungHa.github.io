export type QuestStatus = 'none' | 'active' | 'ready' | 'done'

export interface QuestRewards {
  meso: number
  exp: number
  items: Array<{ itemId: string, quantity: number }>
}

export interface QuestDefinition {
  id: string
  name: string
  target: { monsterId: string, count: number }
  rewards: QuestRewards
}

export interface QuestProgress {
  questId: string
  status: QuestStatus
  killCount: number
}

export interface QuestCompletion {
  progress: QuestProgress
  rewards: QuestRewards | null
}

export function createQuestProgress(questId: string): QuestProgress {
  return { questId, status: 'none', killCount: 0 }
}

export function acceptQuest(progress: QuestProgress): QuestProgress {
  return progress.status === 'none'
    ? { ...progress, status: 'active' }
    : progress
}

export function declineQuest(progress: QuestProgress): QuestProgress {
  return progress
}

export function recordQuestKill(
  progress: QuestProgress,
  quest: QuestDefinition,
  monsterId: string,
): QuestProgress {
  if (progress.status !== 'active' || monsterId !== quest.target.monsterId) return progress

  const killCount = Math.min(progress.killCount + 1, quest.target.count)
  return {
    ...progress,
    killCount,
    status: killCount >= quest.target.count ? 'ready' : 'active',
  }
}

export function completeQuest(
  progress: QuestProgress,
  quest: QuestDefinition,
): QuestCompletion {
  if (progress.status !== 'ready') return { progress, rewards: null }
  return {
    progress: { ...progress, status: 'done' },
    rewards: quest.rewards,
  }
}
