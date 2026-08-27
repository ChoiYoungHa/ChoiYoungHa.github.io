export interface TitleConfirmBuffer {
  pending: boolean
}

export interface TitleConfirmResult {
  state: TitleConfirmBuffer
  emit: boolean
}

export const INITIAL_TITLE_CONFIRM_BUFFER: Readonly<TitleConfirmBuffer> = Object.freeze({ pending: false })

export function queueTitleConfirm(state: TitleConfirmBuffer, runtimeReady: boolean): TitleConfirmResult {
  return runtimeReady
    ? { state: INITIAL_TITLE_CONFIRM_BUFFER, emit: true }
    : { state: state.pending ? state : { pending: true }, emit: false }
}

export function releaseTitleConfirm(state: TitleConfirmBuffer, runtimeReady: boolean): TitleConfirmResult {
  return runtimeReady && state.pending
    ? { state: INITIAL_TITLE_CONFIRM_BUFFER, emit: true }
    : { state, emit: false }
}
