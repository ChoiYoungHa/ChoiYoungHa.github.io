/**
 * M4-02 시작 안내 표시 규칙 — three/React 비의존 순수 함수 (Node 테스트: Automation/test-ui-logic.mjs).
 *
 * 로드맵 완료 조건: 0~5.0초 표시 · 5.1초 이후 DOM hidden.
 * 경계를 닫힌 구간 [0, HINT_VISIBLE_MS] 로 두어 5.0초 정각은 "표시", 5.1초는 "숨김" 이 된다.
 */

/** 안내를 보여주는 시간(ms). 로드맵 M4-02 의 5초. */
export const HINT_VISIBLE_MS = 5000

/** 마운트 후 경과 시간 tMs 에 안내가 보여야 하는가. 음수(아직 시작 전)는 false. */
export function hintVisibleAt(tMs: number, visibleMs: number = HINT_VISIBLE_MS): boolean {
  if (!Number.isFinite(tMs) || tMs < 0) return false
  return tMs <= visibleMs
}

/**
 * 컴포넌트가 hidden 으로 넘어갈 타이머 지연(ms). 표시 구간이 닫힌 구간이므로 1ms 를 더해
 * 정확히 visibleMs 시점에는 아직 보이고 그 다음 틱부터 숨긴다.
 */
export function hintHideDelayMs(visibleMs: number = HINT_VISIBLE_MS): number {
  return Math.max(0, visibleMs) + 1
}
