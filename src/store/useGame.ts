import { create } from 'zustand'
import { reduce, type GameAction } from '../game/reducers.ts'
import { expRequiredForLevel } from '../game/rules/stats.ts'
import { createInitialState, type GameState } from '../game/state.ts'

export interface GameStoreState extends GameState {
  dispatch: (action: GameAction) => void
}

const initial = createInitialState(null, '')

/** Reactive mirror of the pure game reducer; business rules remain in reducers.ts. */
export const useGame = create<GameStoreState>((set) => ({
  ...initial,
  dispatch: (action) => set((state) => reduce(state, action)),
}))

export function selectScene(state: GameStoreState): GameState['scene'] {
  return state.scene
}

export function selectQuestVisible(state: GameStoreState): boolean {
  return state.quest.status !== 'none'
}

export function selectHudProps(state: GameStoreState) {
  return {
    stats: {
      level: state.level,
      name: state.name,
      hp: state.hp,
      maxHp: state.maxHp,
      mp: state.mp,
      maxMp: state.maxMp,
      exp: state.exp,
      expRequired: expRequiredForLevel(state.level),
    },
    quest: { status: state.quest.status, killCount: state.quest.killCount },
    meso: state.meso,
    ipMode: state.ipMode,
  }
}
