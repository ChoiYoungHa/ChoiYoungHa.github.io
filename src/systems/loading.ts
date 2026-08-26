import loadingManifestJson from '../data/loading-manifest.json' with { type: 'json' }
import type { LoadingPhase } from './ui/loadingLogic'

type LoadablePhase = Exclude<LoadingPhase, 'ready'>

export interface LoadingManifestItem {
  id: string
  url: string
  bytes: number
  kind: string
}

export interface LoadingManifest {
  schemaVersion: number
  measuredFromHead: string
  measurement: string
  phases: Record<LoadablePhase, LoadingManifestItem[]>
  summary: object
}

export interface LoadingState {
  phase: LoadingPhase
  loadedBytes: number
  phaseBytes: number
  error?: Error
}

interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  arrayBuffer(): Promise<ArrayBuffer>
}

type FetchResource = (url: string, init?: RequestInit) => Promise<FetchResponse>
type LoadingListener = () => void

export interface LoadingStoreOptions {
  fetch?: FetchResource
  logger?: Pick<Console, 'info'>
}

export interface LoadingStore {
  getState(): LoadingState
  subscribe(listener: LoadingListener): () => void
  start(): Promise<LoadingState>
  retry(): Promise<LoadingState>
}

export const PHASE_ORDER: readonly LoadablePhase[] = ['boot', 'core', 'detail'] as const

const runtimeManifest = loadingManifestJson as LoadingManifest

function phaseBytes(manifest: LoadingManifest, phase: LoadablePhase): number {
  return manifest.phases[phase].reduce((sum, item) => sum + item.bytes, 0)
}

function isBootstrapResident(item: LoadingManifestItem): boolean {
  return item.kind === 'html' || item.kind === 'javascript'
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/** Build-time paths in the manifest become stable URLs at the deployed root. */
export function runtimeUrl(path: string): string {
  if (path.startsWith('/')) return path
  const withoutRoot = path.replace(/^(?:dist|public)\//, '')
  return `/${withoutRoot}`
}

/**
 * three/useRuntime 비의존 3단 로딩 스토어.
 * App 코드가 실행될 때 HTML·JS는 이미 내려받은 상태이므로 중복 fetch 없이 선언 bytes만 집계한다.
 * 그 외 비절차적 항목은 GET 본문을 끝까지 읽어 preload와 실제 bytes 집계를 함께 수행한다.
 */
export function createLoadingStore(
  manifest: LoadingManifest = runtimeManifest,
  options: LoadingStoreOptions = {},
): LoadingStore {
  const listeners = new Set<LoadingListener>()
  const logger = options.logger ?? console
  const fetchResource: FetchResource =
    options.fetch ?? ((url, init) => globalThis.fetch(url, init) as Promise<FetchResponse>)
  let state: LoadingState = { phase: 'boot', loadedBytes: 0, phaseBytes: phaseBytes(manifest, 'boot') }
  let activeRun: Promise<LoadingState> | undefined

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const replaceState = (next: LoadingState) => {
    state = next
    emit()
  }

  const transition = (phase: LoadingPhase) => {
    const previous = state.phase
    replaceState({
      phase,
      loadedBytes: 0,
      phaseBytes: phase === 'ready' ? 0 : phaseBytes(manifest, phase),
    })
    logger.info(previous === phase ? `[loading] phase ${phase}` : `[loading] ${previous} -> ${phase}`)
  }

  const loadPhase = async (phase: LoadablePhase) => {
    for (const item of manifest.phases[phase]) {
      let loaded = 0
      if (item.bytes === 0) {
        loaded = 0
      } else if (isBootstrapResident(item)) {
        loaded = item.bytes
      } else {
        const url = runtimeUrl(item.url)
        const response = await fetchResource(url, { method: 'GET' })
        if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}: ${item.id} (${url})`)
        loaded = (await response.arrayBuffer()).byteLength
      }
      replaceState({
        phase,
        loadedBytes: state.loadedBytes + loaded,
        phaseBytes: state.phaseBytes,
      })
    }
  }

  const run = async (): Promise<LoadingState> => {
    transition('boot')
    try {
      for (const [index, phase] of PHASE_ORDER.entries()) {
        if (index > 0) transition(phase)
        await loadPhase(phase)
      }
      transition('ready')
    } catch (error) {
      replaceState({ ...state, error: asError(error) })
    }
    return state
  }

  const start = (): Promise<LoadingState> => {
    if (activeRun) return activeRun
    activeRun = run().finally(() => {
      activeRun = undefined
    })
    return activeRun
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    start,
    retry: start,
  }
}

export const loadingStore = createLoadingStore()
