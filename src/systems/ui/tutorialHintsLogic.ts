import { t, type IpMode } from '../../game/i18n.ts'

export type TutorialInputEvent = 'move' | 'run' | 'jump'
const ORDER: readonly TutorialInputEvent[] = ['move', 'run', 'jump']
const LABEL_KEYS: Readonly<Record<TutorialInputEvent, string>> = {
  move: 's02.hint.move',
  run: 's02.hint.run',
  jump: 's02.hint.jump',
}

export interface TutorialHintsState {
  completed: TutorialInputEvent[]
  complete: boolean
}

export interface TutorialHintPresentation {
  id: TutorialInputEvent
  label: string
  completed: boolean
  current: boolean
}

export interface TutorialHintsPresentation {
  hints: TutorialHintPresentation[]
  followText: string | null
  narrationLines: [string, string]
}

export function createTutorialHintsState(): TutorialHintsState {
  return { completed: [], complete: false }
}

export function stepTutorialHints(previous: TutorialHintsState, event: TutorialInputEvent): TutorialHintsState {
  if (previous.complete) return previous
  const expected = ORDER[previous.completed.length]
  if (event !== expected) return previous
  const completed = [...previous.completed, event]
  return { completed, complete: completed.length === ORDER.length }
}

export function tutorialStateFromEvents(events: readonly TutorialInputEvent[]): TutorialHintsState {
  return events.reduce(stepTutorialHints, createTutorialHintsState())
}

export function tutorialHintsPresentation(state: TutorialHintsState, ipMode: IpMode): TutorialHintsPresentation {
  return {
    hints: ORDER.map((id, index) => ({
      id,
      label: t(LABEL_KEYS[id], ipMode),
      completed: state.completed.includes(id),
      current: !state.complete && index === state.completed.length,
    })),
    followText: state.complete ? t('s02.hint.follow', ipMode) : null,
    narrationLines: [t('s02.narration.1', ipMode), t('s02.narration.2', ipMode)],
  }
}
