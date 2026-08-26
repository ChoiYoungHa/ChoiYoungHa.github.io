import dialogueData from './data/dialogues.json' with { type: 'json' }
import questData from './data/quests.json' with { type: 'json' }
import type { GameAction } from './reducers.ts'
import type { QuestDefinition, QuestStatus } from './rules/quest.ts'

export type DialogueId = 's02' | 'stan' | 'maya' | 'firstKill' | 's10'

export interface DialogueContext {
  questStatus: QuestStatus
  purchased: boolean
}

interface DialogueChoiceDefinition {
  id: string
  labelKey: string
  next?: string
  effect?: 'quest-accept' | 'quest-complete'
}

interface DialogueNodeDefinition {
  speakerKey?: string
  lines: string[]
  choices?: DialogueChoiceDefinition[]
  next?: string
  end?: boolean
}

interface DialogueTreeDefinition {
  routes: Record<string, string>
  nodes: Record<string, DialogueNodeDefinition>
}

export interface DialogueState {
  treeId: DialogueId
  nodeId: string
  lineIndex: number
  finished: boolean
}

export interface DialogueChoice {
  id: string
  labelKey: string
}

export interface DialogueView {
  speakerKey: string | null
  lineKey: string | null
  choices: DialogueChoice[]
}

export interface DialogueAdvanceResult {
  state: DialogueState
  actions: GameAction[]
}

const trees = dialogueData as unknown as Record<DialogueId, DialogueTreeDefinition>
const pigQuest = questData['pig-cleanup'] as unknown as QuestDefinition

function routeFor(treeId: DialogueId, context: DialogueContext): string {
  if (treeId === 'stan') return context.questStatus
  if (treeId === 'maya') return context.purchased ? 'purchased' : 'default'
  return 'default'
}

function nodeFor(state: DialogueState): DialogueNodeDefinition {
  const node = trees[state.treeId].nodes[state.nodeId]
  if (node === undefined) throw new Error(`unknown dialogue node: ${state.treeId}.${state.nodeId}`)
  return node
}

function actionFor(effect: DialogueChoiceDefinition['effect']): GameAction[] {
  if (effect === 'quest-accept') return [{ type: 'quest-accept' }]
  if (effect === 'quest-complete') return [{ type: 'quest-complete', quest: pigQuest }]
  return []
}

export function createDialogue(treeId: DialogueId, context: DialogueContext): DialogueState {
  const tree = trees[treeId]
  if (tree === undefined) throw new Error(`unknown dialogue: ${treeId}`)
  const route = routeFor(treeId, context)
  const nodeId = tree.routes[route]
  if (nodeId === undefined) throw new Error(`missing dialogue route: ${treeId}.${route}`)
  return { treeId, nodeId, lineIndex: 0, finished: false }
}

export function dialogueView(state: DialogueState): DialogueView {
  if (state.finished) return { speakerKey: null, lineKey: null, choices: [] }
  const node = nodeFor(state)
  const onLastLine = state.lineIndex === node.lines.length - 1
  return {
    speakerKey: node.speakerKey ?? null,
    lineKey: node.lines[state.lineIndex] ?? null,
    choices: onLastLine
      ? (node.choices ?? []).map(({ id, labelKey }) => ({ id, labelKey }))
      : [],
  }
}

export function advance(state: DialogueState, choiceId?: string): DialogueAdvanceResult {
  if (state.finished) return { state, actions: [] }
  const node = nodeFor(state)
  const onLastLine = state.lineIndex >= node.lines.length - 1

  if (!onLastLine) {
    return { state: { ...state, lineIndex: state.lineIndex + 1 }, actions: [] }
  }

  if ((node.choices?.length ?? 0) > 0) {
    if (choiceId === undefined) return { state, actions: [] }
    const choice = node.choices?.find((candidate) => candidate.id === choiceId)
    if (choice === undefined) throw new Error(`unknown dialogue choice: ${choiceId}`)
    return {
      state: choice.next === undefined
        ? { ...state, finished: true }
        : { ...state, nodeId: choice.next, lineIndex: 0 },
      actions: actionFor(choice.effect),
    }
  }

  if (node.next !== undefined) {
    return {
      state: { ...state, nodeId: node.next, lineIndex: 0 },
      actions: [],
    }
  }

  return { state: { ...state, finished: true }, actions: [] }
}
