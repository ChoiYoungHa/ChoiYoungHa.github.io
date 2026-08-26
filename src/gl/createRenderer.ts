import { WebGPURenderer } from 'three/webgpu'

/**
 * 계획서.md §2-3 적용 규약.
 * - 진입점은 `three`가 아니라 `three/webgpu`
 * - `await renderer.init()` 필수 (백엔드 준비 전 렌더 금지)
 * - `?gl=webgl` 이면 forceWebGL:true 로 WebGL2 백엔드 강제 (§4-3 측정용 스위치)
 */

export type Backend = 'WebGPU' | 'WebGL2'

/** URL 쿼리로 WebGL2 백엔드를 강제하는가 */
export function isForcedWebGL(search: string = location.search): boolean {
  return new URLSearchParams(search).get('gl') === 'webgl'
}

type BackendLike = { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } | undefined

/**
 * 실제로 붙은 백엔드를 renderer 인스턴스에서 읽는다. 자기보고가 아니라 실측이다.
 *
 * three r185 소스 실측: WebGPUBackend.js L88 `this.isWebGPUBackend = true`,
 * WebGLBackend.js L57 `this.isWebGLBackend = true`.
 * constructor.name 은 프로덕션 minify 에서 뭉개지므로(실측: "ew") 쓰지 않는다.
 */
export function readBackend(renderer: WebGPURenderer): Backend | 'unknown' {
  const backend = (renderer as unknown as { backend?: BackendLike }).backend
  if (backend?.isWebGPUBackend === true) return 'WebGPU'
  if (backend?.isWebGLBackend === true) return 'WebGL2'
  return 'unknown'
}

/**
 * R3F `<Canvas gl={createRenderer}>` 에 넘기는 async 팩토리.
 * props 로 canvas 등이 들어온다.
 */
export async function createRenderer(props: Record<string, unknown>): Promise<WebGPURenderer> {
  const forceWebGL = isForcedWebGL()
  const renderer = new WebGPURenderer({
    ...props,
    antialias: false, // §2-3: iGPU에서 MSAA 대역폭 비용이 크다
    forceWebGL,
  } as ConstructorParameters<typeof WebGPURenderer>[0])
  await renderer.init()
  return renderer
}
