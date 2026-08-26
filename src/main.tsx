import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { runBenchRoute } from './systems/bench/benchRoute'
import { startErrorCollector, triggerIntentionalRejection } from './systems/errors'
import { collectPerf } from './systems/perf'
import { parseQualityPreset, useRuntime } from './store/useRuntime'

type RendererForPerf = Parameters<typeof collectPerf>[0]

declare global {
  interface Window {
    __R3F_RENDERER__?: RendererForPerf
  }
}

const params = new URLSearchParams(location.search)
const mode = params.get('route') === 'bench' ? 'bench' : 'manual'
window.__benchMode = mode
useRuntime.getState().set({ preset: parseQualityPreset(params.get('q')) })

if (mode === 'bench') blockHumanInput()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (mode === 'bench') void runBench()

async function runBench() {
  const errors = startErrorCollector()
  try {
    const renderer = await waitForRenderer()
    triggerIntentionalRejection()
    const [route, perf] = await Promise.all([runBenchRoute(), collectPerf(renderer)])
    const result = { ...route, perf, errors: errors.snapshot(), mode, hud: readHudText() }
    window.__bench = result
    console.info(`BENCH_RESULT ${JSON.stringify(result)}`)
    await postBenchResult(result)
  } catch (error) {
    const result = {
      mode,
      status: 'FAIL',
      error: error instanceof Error ? error.message : String(error),
      errors: errors.snapshot(),
    }
    window.__bench = result
    console.error(`BENCH_RESULT ${JSON.stringify(result)}`)
    await postBenchResult(result)
  } finally {
    errors.stop()
  }
}

async function waitForRenderer(timeoutMs = 15_000): Promise<RendererForPerf> {
  const startedAt = performance.now()
  while (!window.__R3F_RENDERER__) {
    if (performance.now() - startedAt >= timeoutMs) throw new Error('renderer wait timeout')
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
  return window.__R3F_RENDERER__
}

/** 화면에 실제로 그려진 HUD 문자열. bench 결과가 어느 모드·백엔드였는지의 증거가 된다. */
function readHudText(): string | null {
  return document.querySelector('[data-testid="runtime-hud"]')?.textContent ?? null
}

function blockHumanInput(): void {
  const stop = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) {
    window.addEventListener(type, stop, { capture: true, passive: false })
  }
}

async function postBenchResult(result: Record<string, unknown>): Promise<void> {
  const name = params.get('benchReport')
  if (!name) return
  const origin = params.get('benchReportOrigin') ?? location.origin
  await fetch(`${origin}/result?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    mode: origin === location.origin ? 'same-origin' : 'no-cors',
    body: JSON.stringify(result, null, 2),
  }).catch(() => {})
}
