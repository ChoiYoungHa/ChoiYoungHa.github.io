import { t, type IpMode } from '../../game/i18n.ts'

export const EPILOGUE_LINE_INTERVAL_MS = 1_200
export const EPILOGUE_FADE_MS = 600

export interface EpilogueLinePresentation {
  id: string
  text: string
  opacity: number
}

export interface EpiloguePresentation {
  lines: EpilogueLinePresentation[]
  teaser: string
  showActions: boolean
  actions: { retry: string, freeExplore: string }
}

function lineOpacity(elapsedMs: number, index: number): number {
  const elapsedSinceStart = elapsedMs - index * EPILOGUE_LINE_INTERVAL_MS
  return Math.max(0, Math.min(1, elapsedSinceStart / EPILOGUE_FADE_MS))
}

export function epiloguePresentation(elapsedMs: number, ipMode: IpMode): EpiloguePresentation {
  const safeElapsedMs = Math.max(0, elapsedMs)
  const lines = [1, 2, 3].map((lineNumber, index) => ({
    id: `line-${lineNumber}`,
    text: t(`s10.narration.${lineNumber}`, ipMode),
    opacity: lineOpacity(safeElapsedMs, index),
  }))
  const actionsAtMs = (lines.length - 1) * EPILOGUE_LINE_INTERVAL_MS + EPILOGUE_FADE_MS
  return {
    lines,
    teaser: t('s10.teaser', ipMode),
    showActions: safeElapsedMs >= actionsAtMs,
    actions: {
      retry: t('s10.retry', ipMode),
      freeExplore: t('s10.freeExplore', ipMode),
    },
  }
}
