import { addAfterEffect } from '@react-three/fiber'
import { useRuntime } from '../store/useRuntime'

/**
 * `?report=<name>` 이 있을 때만 동작하는 검증용 리포터.
 * 몇 프레임 돈 뒤의 런타임 상태를 서버로 POST 한다(Automation/probe-server.mjs 가 받는다).
 *
 * 헤드리스 Chrome 의 --dump-dom 은 load 직후 종료하고 --virtual-time-budget 은
 * 실제 GPU 대기보다 먼저 만료된다(실측). 그래서 DOM 을 긁지 않고 페이지가 직접 보고한다.
 *
 * 프로덕션 사용자에게는 아무 영향이 없다 — 쿼리가 없으면 즉시 반환한다.
 */
export function reportIfRequested(delayMs = 4000): () => void {
  const name = new URLSearchParams(location.search).get('report')
  if (!name) return () => {}

  const timer = setTimeout(() => {
    void (async () => {
      // 캔버스 픽셀은 rAF 직후에 읽어야 비어 있지 않다.
      const shot = await captureCanvas()
      if (shot) {
        await fetch(`/shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: shot }).catch(
          () => {},
        )
      }
    })()
    const s = useRuntime.getState()
    const payload = {
      at: new Date().toISOString(),
      query: location.search,
      backend: s.backend,
      forceWebGL: s.forceWebGL,
      adapter: s.adapter,
      angle: s.angle,
      preset: s.preset,
      canvas: s.canvas,
      fps: s.fps,
      calls: s.calls,
      triangles: s.triangles,
      errorCount: s.errors.length,
      errors: s.errors,
      hud: document.querySelector('[data-testid="runtime-hud"]')?.textContent ?? null,
      sceneCounts: readSceneCounts(),
    }
    void fetch(`/result?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify(payload, null, 2),
    })
  }, delayMs)

  return () => clearTimeout(timer)
}

/**
 * M0a-07 증거용 캔버스 캡처.
 * WebGPU/WebGL 모두 드로잉 버퍼가 합성 후 비워질 수 있어 rAF 직후에 읽는다.
 * 비어 있으면 null 을 돌려주고 판정은 보류한다 — 빈 PNG 를 증거라고 부르지 않는다.
 */
async function captureCanvas(): Promise<string | null> {
  const canvas = document.querySelector('.stage canvas') as HTMLCanvasElement | null
  if (!canvas) return null
  // R77-A: rAF 콜백은 R3F 렌더 루프와 등록 순서 경쟁이라 WebGPU 캔버스가 제시 후 비워진 뒤 읽히면 검은 PNG(20,831B)가 된다
  // (R64 4/22 → R77 18/18). R3F 의 addAfterEffect 는 renderer.render 직후 같은 태스크에서 불리므로 그 자리에서 읽는다.
  const url = await new Promise<string | null>((resolve) => {
    const off = addAfterEffect(() => {
      off()
      try {
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(null)
      }
    })
  })
  return url && url.length > 5000 ? url : null // 5KB 미만이면 사실상 빈 화면
}

/**
 * M0a-08 완료 조건(바닥·큐브·광원 3요소)을 씬 그래프에서 직접 센다.
 * 전역에 노출된 R3F root 를 통해 읽는다 — 없으면 null 을 돌려주고 판정은 보류한다.
 */
function readSceneCounts(): Record<string, number> | null {
  const scene = (
    globalThis as unknown as { __R3F_SCENE__?: { traverse: (f: (o: unknown) => void) => void } }
  ).__R3F_SCENE__
  if (!scene) return null
  const counts: Record<string, number> = { mesh: 0, light: 0, gridHelper: 0 }
  scene.traverse((o) => {
    const obj = o as { isMesh?: boolean; isLight?: boolean; type?: string }
    if (obj.isMesh) counts.mesh += 1
    if (obj.isLight) counts.light += 1
    if (obj.type === 'GridHelper') counts.gridHelper += 1
  })
  return counts
}
