import {
  PHASE_LABEL,
  isSceneVisiblePhase,
  loadingErrorMessage,
  loadingProgress,
  type LoadingPhase,
} from './loadingLogic'

/**
 * M4-11 — 로딩 화면: phase · 진행률(core 까지 0~100) · 오류 · 재시도.
 *
 * 진행률 계산은 `loadingLogic.ts`(순수 함수). 이 컴포넌트는 표시만 한다.
 * `progress` 를 직접 주면 그 값을, 대신 `loadedBytes`/`phaseBytes` 를 주면 `loadingProgress` 로 계산한다.
 * detail·ready 단계에서는(화면이 이미 떠 있으므로) 오류가 없는 한 아무것도 그리지 않는다.
 *
 * 아직 마운트하지 않는다 — R29 에서 App.tsx 가 로더 phase 를 상태로 들고 `<LoadingScreen phase=… />` 로 붙인다.
 */
export interface LoadingScreenProps {
  phase: LoadingPhase
  /** 0~100. 주지 않으면 loadedBytes/phaseBytes 로 계산 */
  progress?: number
  loadedBytes?: number
  phaseBytes?: number
  /** 오류 원문(Error 또는 문자열). 있으면 진행바 대신 오류와 재시도 버튼 */
  error?: unknown
  onRetry?: () => void
}

export function LoadingScreen({ phase, progress, loadedBytes, phaseBytes, error, onRetry }: LoadingScreenProps) {
  const hasError = error !== undefined && error !== null && error !== ''
  if (!hasError && isSceneVisiblePhase(phase)) return null

  const pct =
    progress !== undefined
      ? Math.round(Math.min(100, Math.max(0, progress)))
      : loadingProgress(phase, loadedBytes ?? 0, phaseBytes ?? 0)
  const onLine = typeof navigator === 'undefined' ? undefined : navigator.onLine

  return (
    <div
      data-testid="loading-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#8fa0b0',
        color: '#1c2228',
        font: '14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}
    >
      <div style={{ width: 360, textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>거대 수목과 마을</div>
        {hasError ? (
          <>
            <div data-testid="loading-error" style={{ marginBottom: 12, color: '#5b2a1e' }}>
              {loadingErrorMessage(error, onLine)}
            </div>
            <button
              type="button"
              data-testid="loading-retry"
              onClick={onRetry}
              style={{ padding: '8px 18px', font: 'inherit', cursor: 'pointer' }}
            >
              다시 시도
            </button>
          </>
        ) : (
          <>
            <div data-testid="loading-phase" style={{ marginBottom: 8 }}>
              {PHASE_LABEL[phase]}
            </div>
            <div
              style={{
                height: 8,
                background: 'rgba(28, 34, 40, 0.18)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              <div
                data-testid="loading-bar"
                style={{ width: `${pct}%`, height: '100%', background: '#4b4a33', transition: 'width 120ms linear' }}
              />
            </div>
            <div data-testid="loading-progress" style={{ marginTop: 6 }}>
              {pct}%
            </div>
          </>
        )}
      </div>
    </div>
  )
}
