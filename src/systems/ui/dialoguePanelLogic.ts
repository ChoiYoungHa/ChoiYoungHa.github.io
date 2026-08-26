import { dialogueView, type DialogueState } from '../../game/dialogue.ts'
import { t, type IpMode } from '../../game/i18n.ts'

export const ACCEPT_FLASH_MS = 400

export interface DialoguePanelChoice {
  id: string
  label: string
}

export interface DialoguePanelPresentation {
  visible: boolean
  speaker: string
  body: string
  choices: DialoguePanelChoice[]
}

export function dialoguePanelPresentation(state: DialogueState, ipMode: IpMode): DialoguePanelPresentation {
  const view = dialogueView(state)
  return {
    visible: !state.finished && view.lineKey !== null,
    speaker: view.speakerKey === null ? '' : t(view.speakerKey, ipMode),
    body: view.lineKey === null ? '' : t(view.lineKey, ipMode),
    choices: view.choices.map(({ id, labelKey }) => ({ id, label: t(labelKey, ipMode) })),
  }
}

export function acceptFlashVisible(acceptedAtMs: number | undefined, nowMs: number): boolean {
  if (acceptedAtMs === undefined) return false
  const elapsed = nowMs - acceptedAtMs
  return elapsed >= 0 && elapsed < ACCEPT_FLASH_MS
}
