import { create } from 'zustand'
import type { Backend } from '../gl/createRenderer'

export type QualityPreset = 'low' | 'base'

/**
 * R117-A — 기본 프리셋. 영하님 결정(2026-08-27 "버벅이지 않으니 컴퓨팅 자원을 더 써도 된다")과
 * R114-A 실측(base 관문 PASS: avg 130.17 · 1%low 22.31 · pipelines 45)에 따라 base 로 올렸다.
 * 약한 기기는 `systems/perf/autoFallback.ts` 가 첫 화면에서 1회 low 로 내린다.
 * 측정 러너(run-bench·game-walk·lookdev-variants)는 URL 에 `?q=low` 를 명시하므로 정본은 불변이다.
 */
export const DEFAULT_QUALITY_PRESET: QualityPreset = 'base'

/**
 * 계획서.md §3-3 — 매 프레임 바뀌는 값은 스토어에 넣지 않는다.
 * 플레이어 위치·카메라 행렬은 useRef 로만 다루고, 여기에는 **1초 1회 집계**만 올린다.
 */
export interface RuntimeState {
  backend: Backend | 'unknown'
  forceWebGL: boolean
  adapter: string
  angle: string
  preset: QualityPreset
  /** R117-A — 자동 후퇴가 실제로 일어났는가(Settings 표시용). */
  autoFallback: boolean
  canvas: { w: number; h: number }
  fps: number
  calls: number
  triangles: number
  programs: number
  /** M2-09 — 거대 수목 active LOD. 1초 1회 집계로만 올린다. */
  heroTreeLod: 0 | 1
  errors: string[]
  set: (patch: Partial<Omit<RuntimeState, 'set' | 'pushError'>>) => void
  pushError: (msg: string) => void
}

export const useRuntime = create<RuntimeState>((set) => ({
  backend: 'unknown',
  forceWebGL: false,
  adapter: '-',
  angle: '-',
  preset: DEFAULT_QUALITY_PRESET,
  autoFallback: false,
  canvas: { w: 0, h: 0 },
  fps: 0,
  calls: 0,
  triangles: 0,
  programs: 0,
  heroTreeLod: 0,
  errors: [],
  set: (patch) => set(patch),
  pushError: (msg) => set((s) => ({ errors: [...s.errors, msg].slice(0, 20) })),
}))

/** `?q=low|base` 는 항상 사용자의 선택이 이긴다. 지정이 없을 때만 기본값을 쓴다. */
export function parseQualityPreset(value: string | null): QualityPreset {
  if (value === 'low') return 'low'
  if (value === 'base') return 'base'
  return DEFAULT_QUALITY_PRESET
}
