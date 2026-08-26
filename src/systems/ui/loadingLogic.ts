/**
 * M4-11 로딩 진행률 규칙 — three/React 비의존 순수 함수 (Node 테스트: Automation/test-ui-logic.mjs).
 *
 * 계획서 §3-5 3단 로딩: boot(≤4MB) → core(≤12MB 누적, 여기서 화면이 뜬다) → detail(백그라운드).
 * 진행률 0~100 은 **core 까지**만 센다(로드맵 M4-11 "core까지 진행률 0~100"). detail·ready 는 항상 100.
 * boot 와 core 의 비중은 §3-5 예산(4MB : 8MB)으로 고정한다 → boot 0~33.3, core 33.3~100.
 *
 * `src/data/loading-manifest.json`(worker-codex 작성 예정)이 phase 별 바이트를 주면 `phaseBytes` 로 넘긴다.
 * 없으면 boot/core/detail 이름만 고정이고 바이트는 0 → 해당 phase 의 시작값을 돌려준다.
 */

export type LoadingPhase = 'boot' | 'core' | 'detail' | 'ready'

export const LOADING_PHASES: readonly LoadingPhase[] = ['boot', 'core', 'detail', 'ready'] as const

/** §3-5 예산(MB). boot 4 / core 누적 12 → core 단독 8. */
export const PHASE_BUDGET_MB = { boot: 4, core: 8 } as const

/** 진행률 축에서 각 phase 가 차지하는 구간 [시작, 끝] (0~100). */
export const PHASE_SPAN: Record<LoadingPhase, readonly [number, number]> = {
  boot: [0, (PHASE_BUDGET_MB.boot / (PHASE_BUDGET_MB.boot + PHASE_BUDGET_MB.core)) * 100],
  core: [(PHASE_BUDGET_MB.boot / (PHASE_BUDGET_MB.boot + PHASE_BUDGET_MB.core)) * 100, 100],
  detail: [100, 100],
  ready: [100, 100],
}

export function isLoadingPhase(value: unknown): value is LoadingPhase {
  return typeof value === 'string' && (LOADING_PHASES as readonly string[]).includes(value)
}

/**
 * phase 안에서 loadedBytes/phaseBytes 만큼 진행됐을 때의 전체 진행률(정수 0~100).
 * phaseBytes ≤ 0 이거나 값이 유한하지 않으면 phase 시작값. loaded 가 phaseBytes 를 넘으면 phase 끝값.
 */
export function loadingProgress(phase: LoadingPhase, loadedBytes: number, phaseBytes: number): number {
  const [start, end] = PHASE_SPAN[phase]
  if (end === start) return Math.round(end)
  const valid = Number.isFinite(loadedBytes) && Number.isFinite(phaseBytes) && phaseBytes > 0
  const fraction = valid ? Math.min(1, Math.max(0, loadedBytes / phaseBytes)) : 0
  return Math.round(start + (end - start) * fraction)
}

/** 화면에 뜨는 단계인가(core 완료 이후). */
export function isSceneVisiblePhase(phase: LoadingPhase): boolean {
  return phase === 'detail' || phase === 'ready'
}

/**
 * 오프라인/네트워크 오류 판정. `navigator.onLine === false` 이거나 fetch 계열 실패 메시지면 true.
 * 브라우저 밖(Node)에서는 onLine 을 undefined 로 넘긴다.
 */
export function isOfflineError(error: unknown, onLine: boolean | undefined): boolean {
  if (onLine === false) return true
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /failed to fetch|networkerror|load failed|net::ERR|ERR_INTERNET_DISCONNECTED|offline/i.test(msg)
}

/** 사용자에게 보여줄 오류 문구. */
export function loadingErrorMessage(error: unknown, onLine: boolean | undefined): string {
  if (isOfflineError(error, onLine)) return '네트워크에 연결되어 있지 않습니다. 연결을 확인한 뒤 다시 시도하세요.'
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return msg ? `불러오기에 실패했습니다: ${msg}` : '불러오기에 실패했습니다.'
}

export const PHASE_LABEL: Record<LoadingPhase, string> = {
  boot: '부팅 — 지형·하늘',
  core: '핵심 — 지형 메시·캐릭터·거대 수목',
  detail: '세부 — 마을·식생 (백그라운드)',
  ready: '준비 완료',
}
