import itemData from './data/items.json' with { type: 'json' }
import {
  addInventoryItem,
  type ItemDefinition,
} from './rules/inventory.ts'
import {
  acceptQuest,
  completeQuest,
  recordQuestKill,
  type QuestDefinition,
} from './rules/quest.ts'
import { buyItem } from './rules/shop.ts'
import { applyExperience } from './rules/stats.ts'
import {
  jobStartStats,
  type FaceParts,
  type GameScene,
  type GameState,
  type JobId,
} from './state.ts'

const itemById = Object.fromEntries(
  (itemData as unknown as ItemDefinition[]).map((item) => [item.id, item]),
) as Record<string, ItemDefinition>

export type GameAction =
  | { type: 'select-job', jobId: JobId, name?: string, faceParts?: Partial<FaceParts> }
  | { type: 'damage', amount: number }
  | { type: 'heal', hp?: number, mp?: number }
  | { type: 'spend-mp', amount: number }
  | { type: 'gain-exp', amount: number }
  | { type: 'adjust-meso', amount: number }
  | { type: 'purchase', item: ItemDefinition }
  | { type: 'gain-item', item: ItemDefinition, quantity: number }
  | { type: 'quest-accept' }
  | { type: 'quest-kill', quest: QuestDefinition, monsterId: string }
  | { type: 'quest-complete', quest: QuestDefinition }
  | { type: 'scene-transition', scene: GameScene }

function withInventory(state: GameState, inventory: GameState['inventory']): GameState {
  return { ...state, inventory, equipment: { ...inventory.equipment } }
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'select-job': {
      const stats = jobStartStats(action.jobId)
      return {
        ...state,
        jobId: action.jobId,
        name: action.name ?? state.name,
        hp: stats.hp,
        maxHp: stats.hp,
        mp: stats.mp,
        maxMp: stats.mp,
        faceParts: { ...state.faceParts, outfitId: action.jobId, ...action.faceParts },
      }
    }
    case 'damage':
      return { ...state, hp: Math.max(0, state.hp - Math.max(0, action.amount)) }
    case 'heal':
      return {
        ...state,
        hp: Math.min(state.maxHp, state.hp + Math.max(0, action.hp ?? 0)),
        mp: Math.min(state.maxMp, state.mp + Math.max(0, action.mp ?? 0)),
      }
    case 'spend-mp':
      return { ...state, mp: Math.max(0, state.mp - Math.max(0, action.amount)) }
    case 'gain-exp': {
      const result = applyExperience(state, action.amount)
      return { ...state, level: result.level, exp: result.exp }
    }
    case 'adjust-meso':
      return { ...state, meso: Math.max(0, state.meso + action.amount) }
    case 'purchase': {
      if (state.jobId === null) return state
      const result = buyItem({
        jobId: state.jobId,
        meso: state.meso,
        inventory: state.inventory,
      }, action.item)
      return result.ok
        ? withInventory({ ...state, meso: result.state.meso }, result.state.inventory)
        : state
    }
    case 'gain-item': {
      const result = addInventoryItem(state.inventory, action.item, action.quantity)
      return result.added > 0 ? withInventory(state, result.inventory) : state
    }
    case 'quest-accept':
      return { ...state, quest: acceptQuest(state.quest) }
    case 'quest-kill':
      return { ...state, quest: recordQuestKill(state.quest, action.quest, action.monsterId) }
    case 'quest-complete': {
      const completion = completeQuest(state.quest, action.quest)
      if (completion.rewards === null) return state

      let inventory = state.inventory
      for (const reward of completion.rewards.items) {
        const item = itemById[reward.itemId]
        if (item !== undefined) {
          inventory = addInventoryItem(inventory, item, reward.quantity).inventory
        }
      }
      const experience = applyExperience(state, completion.rewards.exp)
      return withInventory({
        ...state,
        quest: completion.progress,
        meso: state.meso + completion.rewards.meso,
        level: experience.level,
        exp: experience.exp,
      }, inventory)
    }
    case 'scene-transition':
      return { ...state, scene: action.scene }
  }
}
