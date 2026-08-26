import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, NoToneMapping } from 'three'
import { Texture, WebGPURenderer } from 'three/webgpu'
import lookdev from '../data/lookdev.json'
import { textureConfigForPreset, type TextureConfig } from './textureConfig'

/**
 * 계획서.md §2-3 적용 규약.
 * - 진입점은 `three`가 아니라 `three/webgpu`
 * - `await renderer.init()` 필수 (백엔드 준비 전 렌더 금지)
 * - `?gl=webgl` 이면 forceWebGL:true 로 WebGL2 백엔드 강제 (§4-3 측정용 스위치)
 */

export type Backend = 'WebGPU' | 'WebGL2'
export type RendererPreset = 'low' | 'base'

export interface RendererTexturePolicy extends TextureConfig {
  preset: RendererPreset
}

let activeTexturePolicy: RendererTexturePolicy = {
  preset: 'low',
  ...textureConfigForPreset('low'),
}

/** Resolve the sampler and asset tier selected before renderer creation. */
export function readRendererTexturePolicy(search: string = location.search): RendererTexturePolicy {
  const preset: RendererPreset = new URLSearchParams(search).get('q') === 'base' ? 'base' : 'low'
  return { preset, ...textureConfigForPreset(preset) }
}

/** Exposes the selected tier to future texture URL/loader consumers. */
export function getActiveTexturePolicy(): RendererTexturePolicy {
  return {
    ...activeTexturePolicy,
    textureTier: { ...activeTexturePolicy.textureTier },
  }
}

/** M3-14 (R30-A) — 톤매퍼 이름 → three 상수. lookdev.json 의 이름과 `?tonemap=` 쿼리 양쪽에서 쓴다. */
export const TONE_MAPPERS = {
  AgXToneMapping: AgXToneMapping,
  ACESFilmicToneMapping: ACESFilmicToneMapping,
  NeutralToneMapping: NeutralToneMapping,
  NoToneMapping: NoToneMapping,
} as const
export type ToneMapperName = keyof typeof TONE_MAPPERS
const TONE_ALIAS: Record<string, ToneMapperName> = {
  agx: 'AgXToneMapping',
  aces: 'ACESFilmicToneMapping',
  neutral: 'NeutralToneMapping',
  none: 'NoToneMapping',
}

/** `?tonemap=agx|aces|neutral|none` 이 있으면 그것, 없으면 lookdev.json 시작값. */
export function readToneMapperName(search: string = location.search): ToneMapperName {
  const q = new URLSearchParams(search).get('tonemap')?.toLowerCase() ?? ''
  if (q in TONE_ALIAS) return TONE_ALIAS[q]
  const start = lookdev.toneMapping.start.name
  return start in TONE_MAPPERS ? (start as ToneMapperName) : 'AgXToneMapping'
}

/** `?exposure=0.5` 가 유한한 양수면 그것, 없으면 lookdev.json 시작값. M3 튜닝은 재빌드 없이 쿼리로 비교한다. */
export function readExposure(search: string = location.search): number {
  const q = Number(new URLSearchParams(search).get('exposure'))
  return Number.isFinite(q) && q > 0 ? q : lookdev.exposure.start
}

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
  const texturePolicy = readRendererTexturePolicy()
  const renderer = new WebGPURenderer({
    ...props,
    antialias: false, // §2-3: iGPU에서 MSAA 대역폭 비용이 크다
    forceWebGL,
  } as ConstructorParameters<typeof WebGPURenderer>[0])
  await renderer.init()
  activeTexturePolicy = {
    ...texturePolicy,
    anisotropy: Math.min(texturePolicy.anisotropy, renderer.getMaxAnisotropy()),
  }
  Texture.DEFAULT_ANISOTROPY = activeTexturePolicy.anisotropy
  return renderer
}

/**
 * M3-14 (R30-A) — 톤매퍼·노출 적용. **R3F `<Canvas>` 는 gl 생성 뒤 자기 기본 톤매퍼(ACES, `flat` 이면 None)를 덮어쓴다**
 * (실측: createRenderer 안에서 설정하면 3종이 전부 같은 결과). 그래서 Canvas `onCreated` 에서 호출해야 한다.
 * 이전(M2 까지)의 실제 톤매퍼는 코드상 "없음" 이 아니라 R3F 기본 ACESFilmic 이었다 — m3-plan.md §1 정정.
 */
export function applyToneMapping(renderer: { toneMapping: number; toneMappingExposure: number }): void {
  renderer.toneMapping = TONE_MAPPERS[readToneMapperName()]
  renderer.toneMappingExposure = readExposure()
}
