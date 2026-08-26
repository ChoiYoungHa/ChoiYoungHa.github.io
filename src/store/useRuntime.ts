import { create } from 'zustand'
import type { Backend } from '../gl/createRenderer'

export type QualityPreset = 'low' | 'base'

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
  preset: 'low',
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

export function parseQualityPreset(value: string | null): QualityPreset {
  return value === 'base' ? 'base' : 'low'
}
