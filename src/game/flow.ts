import questData from './data/quests.json' with { type: 'json' }
import { reduce } from './reducers.ts'
import type { QuestDefinition, QuestStatus } from './rules/quest.ts'
import { GAME_SCENES, type GameScene, type GameState } from './state.ts'

const pigQuest = questData['pig-cleanup'] as unknown as QuestDefinition
const sceneIndex = new Map<GameScene, number>(
  GAME_SCENES.map((scene, index) => [scene, index]),
)
const sceneSet = new Set<string>(GAME_SCENES)

function rank(scene: GameScene): number {
  return sceneIndex.get(scene) ?? -1
}

function questAtLeast(status: QuestStatus, minimum: QuestStatus): boolean {
  const order: QuestStatus[] = ['none', 'active', 'ready', 'done']
  return order.indexOf(status) >= order.indexOf(minimum)
}

export function canEnter(scene: GameScene, state: GameState): boolean {
  if (rank(scene) < rank(state.scene)) return false
  const target = rank(scene)
  if (target <= rank('create')) return true
  if (state.jobId === null) return false
  if (target <= rank('shop')) return true
  if (target <= rank('hunt')) return questAtLeast(state.quest.status, 'active')
  if (scene === 'complete') {
    return state.quest.killCount >= 10 && questAtLeast(state.quest.status, 'ready')
  }
  return state.quest.status === 'done'
}

function ensureJob(state: GameState): GameState {
  return state.jobId === null
    ? reduce(state, {
      type: 'select-job',
      jobId: 'warrior',
      name: state.name || '여행자',
    })
    : state
}

function ensureQuestActive(state: GameState): GameState {
  return state.quest.status === 'none'
    ? reduce(state, { type: 'quest-accept' })
    : state
}

function ensureQuestReady(state: GameState): GameState {
  let next = ensureQuestActive(state)
  while (next.quest.status === 'active' && next.quest.killCount < pigQuest.target.count) {
    next = reduce(next, {
      type: 'quest-kill',
      quest: pigQuest,
      monsterId: pigQuest.target.monsterId,
    })
  }
  return next
}

function ensureQuestDone(state: GameState): GameState {
  const ready = ensureQuestReady(state)
  return ready.quest.status === 'ready'
    ? reduce(ready, { type: 'quest-complete', quest: pigQuest })
    : ready
}

export function enter(scene: GameScene, state: GameState): GameState {
  if (rank(scene) < rank(state.scene)) return state

  let corrected = state
  const target = rank(scene)
  if (target >= rank('forest')) corrected = ensureJob(corrected)
  if (target >= rank('park')) corrected = ensureQuestActive(corrected)
  if (target >= rank('complete')) corrected = ensureQuestReady(corrected)
  if (target >= rank('epilogue')) corrected = ensureQuestDone(corrected)

  return reduce(corrected, { type: 'scene-transition', scene })
}

export function parseSceneQuery(input: string): GameScene | null {
  try {
    const url = new URL(input, 'https://local.invalid')
    const value = url.searchParams.get('scene')
    return value !== null && sceneSet.has(value) ? value as GameScene : null
  } catch {
    return null
  }
}
