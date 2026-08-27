/**
 * R117-A — 기본 프리셋을 `base` 로 올리면서 붙이는 **1회성 자동 후퇴**.
 *
 * 왜 필요한가: 이 PC(Intel Arc iGPU)에서는 base 가 관문을 통과하지만(R114-A: avg 130.17 · 1%low 22.31),
 * 더 약한 기기에서 base 가 기본이면 첫 화면부터 관문 아래로 떨어질 수 있다. 그때 한 번만 `low` 로 내린다.
 *
 * 규약(계획서 §4-3 측정 규약과 같은 이유로 워밍업을 버린다):
 *   · 첫 `WARMUP_SECONDS` 는 셰이더 컴파일·텍스처 업로드 구간이라 표본에서 제외한다.
 *   · 이어지는 `WINDOW_SECONDS` 의 프레임 간격만 모아 평균 fps 와 하위 1% fps 를 낸다.
 *   · 하위 1% 정의는 `systems/perf.ts` 와 같다 — 가장 느린 1% 프레임의 **평균 프레임타임**의 역수.
 *   · 관문(평균 30 / 하위1% 20) 미달이면 후퇴를 1회 권고하고 이후 다시 판정하지 않는다.
 *
 * three·React 비의존 순수 로직이라 Node 에서 결정론적으로 검증한다
 * (`Automation/test-auto-fallback.mjs`). 프리셋을 실제로 바꾸는 일은 호출부(RuntimeProbe)가 한다.
 */

export const WARMUP_SECONDS = 3
export const WINDOW_SECONDS = 8
export const MIN_AVERAGE_FPS = 30
export const MIN_ONE_PERCENT_LOW_FPS = 20

export interface FrameSummary {
  samples: number
  averageFps: number
  onePercentLowFps: number
}

export interface AutoFallbackDecision extends FrameSummary {
  /** true 면 호출부가 프리셋을 low 로 내린다. */
  fallback: boolean
}

export interface AutoFallback {
  /** 창이 끝난 프레임에서만 판정을 돌려준다. 그 전에는 null, 판정 후에도 계속 null. */
  step(dtSeconds: number): AutoFallbackDecision | null
  readonly decided: boolean
}

/** 프레임 간격(ms) 목록 → 평균 fps·하위 1% fps. `systems/perf.ts` 와 같은 계산식이다. */
export function summarizeFrames(frameDurationsMs: readonly number[]): FrameSummary {
  const durations = frameDurationsMs.filter((value) => Number.isFinite(value) && value > 0)
  if (durations.length === 0) return { samples: 0, averageFps: 0, onePercentLowFps: 0 }
  const totalMs = durations.reduce((sum, value) => sum + value, 0)
  const slowCount = Math.max(1, Math.ceil(durations.length * 0.01))
  const slowFrames = [...durations].sort((a, b) => b - a).slice(0, slowCount)
  const slowMean = slowFrames.reduce((sum, value) => sum + value, 0) / slowFrames.length
  return {
    samples: durations.length,
    averageFps: totalMs > 0 ? (durations.length * 1000) / totalMs : 0,
    onePercentLowFps: slowMean > 0 ? 1000 / slowMean : 0,
  }
}

/** 표본이 관문 아래인가. 표본이 없으면(렌더가 돌지 않은 경우) 후퇴하지 않는다. */
export function shouldFallback(summary: FrameSummary): boolean {
  if (summary.samples === 0) return false
  return summary.averageFps < MIN_AVERAGE_FPS || summary.onePercentLowFps < MIN_ONE_PERCENT_LOW_FPS
}

/**
 * 자동 후퇴가 적용되는 상황인가.
 *   · `?q=low|base` 를 명시하면 사용자의 선택이 항상 이긴다 → 후퇴하지 않는다.
 *   · bench·final 러너(`?route=`)는 측정 정본이므로 프리셋이 도중에 바뀌면 안 된다.
 */
export function isAutoFallbackEligible(search: string, benchMode: string | undefined): boolean {
  const params = new URLSearchParams(search)
  if (params.get('q') !== null) return false
  return benchMode === undefined || benchMode === 'manual'
}

export function createAutoFallback(
  options: { warmupSeconds?: number; windowSeconds?: number } = {},
): AutoFallback {
  const warmupSeconds = options.warmupSeconds ?? WARMUP_SECONDS
  const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS
  const frameDurationsMs: number[] = []
  let elapsedSeconds = 0
  let decided = false

  return {
    get decided() {
      return decided
    },
    step(dtSeconds: number): AutoFallbackDecision | null {
      if (decided || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return null
      elapsedSeconds += dtSeconds
      if (elapsedSeconds <= warmupSeconds) return null
      frameDurationsMs.push(dtSeconds * 1000)
      if (elapsedSeconds < warmupSeconds + windowSeconds) return null
      decided = true
      const summary = summarizeFrames(frameDurationsMs)
      return { ...summary, fallback: shouldFallback(summary) }
    },
  }
}
