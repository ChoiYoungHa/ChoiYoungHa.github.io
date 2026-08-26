import { WebGPURenderer } from 'three/webgpu'
import { isForcedWebGL, readBackend } from './createRenderer'

/**
 * M0a-04 검증용 프로브. R3F 없이 순수 three WebGPURenderer 만 초기화한다.
 * 헤드리스 Chrome --dump-dom 으로 #out 의 JSON 을 회수한다.
 * 무응답(RUNNING)으로 끝나면 진단이 불가능하므로 타임아웃과 오류 포착을 넣었다.
 */

const result: Record<string, unknown> = {
  at: new Date().toISOString(),
  query: location.search,
  forceWebGL: isForcedWebGL(),
  init: 'PENDING',
}

function flush() {
  const out = document.getElementById('out')
  if (out) out.textContent = JSON.stringify(result, null, 2)
}

window.addEventListener('error', (e) => {
  result.windowError = String(e.message)
  flush()
})
window.addEventListener('unhandledrejection', (e) => {
  result.unhandledRejection = String((e as PromiseRejectionEvent).reason)
  flush()
})

/**
 * setTimeout 기반 타임아웃은 쓰지 않는다.
 * 헤드리스 Chrome 의 --virtual-time-budget 아래에서는 가상시간이 실제 GPU 대기보다
 * 훨씬 빨리 흘러 즉시 만료돼 버린다(실측: requestAdapter 가 항상 8000ms TIMEOUT).
 * 대신 결과를 서버로 POST 해서 네트워크 pending 으로 가상시간을 붙잡는다.
 */
async function report() {
  const name = new URLSearchParams(location.search).get('report')
  if (!name) return
  try {
    await fetch(`/result?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      body: JSON.stringify(result, null, 2),
    })
  } catch {
    /* 서버가 없으면 DOM 덤프로만 회수한다 */
  }
}

async function main() {
  flush()

  // 1) 브라우저 수준 능력 먼저 (three 와 무관)
  result.hasNavigatorGpu = typeof navigator.gpu !== 'undefined'
  try {
    const adapter = (await navigator.gpu.requestAdapter()) as GPUAdapter | null
    result.adapterOk = !!adapter
    if (adapter) {
      const i = adapter.info
      result.adapter = `${i?.vendor ?? '?'} / ${i?.architecture ?? '?'}`
      const device = await adapter.requestDevice()
      result.deviceOk = !!device
      device.destroy()
    }
  } catch (e) {
    result.adapterStage = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  }
  flush()

  const gl2 = document.createElement('canvas').getContext('webgl2')
  result.webgl2 = !!gl2
  const dbg = gl2?.getExtension('WEBGL_debug_renderer_info')
  result.angle = dbg ? String(gl2!.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'n/a'
  flush()

  // 2) three WebGPURenderer
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1280
    canvas.height = 720
    document.body.appendChild(canvas)

    const renderer = new WebGPURenderer({
      canvas,
      antialias: false,
      forceWebGL: isForcedWebGL(),
    } as ConstructorParameters<typeof WebGPURenderer>[0])

    await renderer.init()

    result.init = 'OK'
    result.backend = readBackend(renderer)
    renderer.dispose()
  } catch (e) {
    result.init = 'FAIL'
    result.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
  }
  flush()
  await report()
}

void main()
