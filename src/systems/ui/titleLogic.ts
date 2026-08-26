import { t, type IpMode } from '../../game/i18n.ts'
import type { LoadingState } from '../loading.ts'
import { loadingProgress, PHASE_LABEL } from './loadingLogic.ts'

export interface TitlePresentation {
  kicker: string
  title: string
  subtitle: string
  startLabel: string
  progress: number
  phaseLabel: string
  canStart: boolean
}

export function titlePresentation(loading: LoadingState, ipMode: IpMode): TitlePresentation {
  return {
    kicker: t('s00.kicker', ipMode),
    title: t('s00.title', ipMode),
    subtitle: t('s00.subtitle', ipMode),
    startLabel: t('s00.start', ipMode),
    progress: loadingProgress(loading.phase, loading.loadedBytes, loading.phaseBytes),
    phaseLabel: PHASE_LABEL[loading.phase],
    canStart: loading.phase === 'ready' && loading.error === undefined,
  }
}
