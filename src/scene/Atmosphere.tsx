/* oxlint-disable react/only-export-components -- smoke probe verifies the preset lookup directly. */
import { useMemo } from 'react'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { useRuntime } from '../store/useRuntime'
import presets from '../data/quality-presets.json'
import { DEPTH_GRADE_DEFAULTS, depthGradeOutput, type DepthGradeParams } from './atmosphere/depthGradeNode'

export const FOG_COLOR = '#8FA0B0'
export type AtmospherePreset = keyof typeof presets

export function getFogDensity(preset: AtmospherePreset): number {
  return presets[preset].fogDensity
}

/**
 * M3-05 (R30-A) — 대기 단계 스위치 `?atmo=0|A|B|C|D` (기본 D = 전부).
 *   0: 안개도 그레이딩도 없음   A: FogExp2 만   B: A + 채도 감쇄   C: B + 색상 시프트   D: C + 휘도 상승
 * M3-05E/F 스모크가 단계별 PNG 를 찍을 때 쓴다. 프로덕션 URL 에는 쿼리가 없으므로 D 다.
 */
export type AtmosphereLevel = '0' | 'A' | 'B' | 'C' | 'D'

export function parseAtmosphereLevel(value: string | null): AtmosphereLevel {
  const v = (value ?? '').toUpperCase()
  return v === '0' || v === 'A' || v === 'B' || v === 'C' ? v : 'D'
}

export function getAtmosphereLevel(search: string = location.search): AtmosphereLevel {
  return parseAtmosphereLevel(new URLSearchParams(search).get('atmo'))
}

/**
 * M3-05B~D 파라미터. §6-2 기본값에서 R26-A 시뮬(test-depth-grade.mjs)로 정정한 값:
 * hueStrength 0.85→0.97(근경 hue 48° 에서 원경 205° 를 넘기려면), lumaGain 0.35→0.34(휘도 상단 145 안).
 */
export const M3_DEPTH_GRADE: DepthGradeParams = {
  ...DEPTH_GRADE_DEFAULTS,
  satFar: 0.25,
  hueStrength: 0.97,
  lumaGain: 0.34,
}

/**
 * `?gnear=&gfar=&gsat=&ghue=&glum=` — 재빌드 없이 그레이딩 파라미터를 바꾼다(M3 튜닝용). 없으면 그대로.
 */
export function readGradeOverrides(search: string = location.search): Partial<DepthGradeParams> {
  const q = new URLSearchParams(search)
  const num = (key: string) => {
    const raw = q.get(key)
    const v = raw === null || raw === '' ? Number.NaN : Number(raw)
    return Number.isFinite(v) ? v : undefined
  }
  const out: Partial<DepthGradeParams> = {}
  const near = num('gnear'), far = num('gfar'), sat = num('gsat'), hue = num('ghue'), lum = num('glum')
  if (near !== undefined) out.nearMeters = near
  if (far !== undefined) out.farMeters = far
  if (sat !== undefined) out.satFar = sat
  if (hue !== undefined) out.hueStrength = hue
  if (lum !== undefined) out.lumaGain = lum
  return out
}

/** 단계별로 켜는 항목만 남긴 파라미터. A/0 은 그레이딩 없음(null). */
export function depthGradeParamsFor(level: AtmosphereLevel): DepthGradeParams | null {
  if (level === '0' || level === 'A') return null
  if (level === 'B') return { ...M3_DEPTH_GRADE, hueStrength: 0, lumaGain: 0 }
  if (level === 'C') return { ...M3_DEPTH_GRADE, lumaGain: 0 }
  return M3_DEPTH_GRADE
}

/** M3-05A — FogExp2 #8FA0B0, density low 0.0080 / base 0.0055 (quality-presets.json 단일 원본). */
export function Atmosphere() {
  const preset = useRuntime((state) => state.preset)
  const level = useMemo(() => getAtmosphereLevel(), [])
  if (level === '0') return null
  return <fogExp2 attach="fog" args={[FOG_COLOR, getFogDensity(preset)]} />
}

export interface LookdevMaterialOptions {
  color?: string
  vertexColors?: boolean
  roughness: number
  metalness: number
}

/**
 * M3-05B~D (R30-A) — 거리 그레이딩이 걸린 표준 재질.
 * R3F 의 classic `<meshStandardMaterial>` 에는 outputNode 가 없어 `three/webgpu` 의 NodeMaterial 을 직접 만든다.
 * `output`(조명+안개 뒤 선형 색)에 depthGradeOutput 을 걸고, 톤매핑·sRGB 는 렌더러 출력 단계가 맡는다.
 * WebGL2(`?gl=webgl`)에서도 같은 TSL 이 GLSL 로 컴파일된다(M3-05F 스모크로 실측).
 */
export function createLookdevMaterial(
  opts: LookdevMaterialOptions,
  level: AtmosphereLevel = getAtmosphereLevel(),
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    color: opts.color,
    vertexColors: opts.vertexColors ?? false,
    roughness: opts.roughness,
    metalness: opts.metalness,
  })
  const params = depthGradeParamsFor(level)
  if (params) material.outputNode = depthGradeOutput({ ...params, ...readGradeOverrides() })
  return material
}

/** 컴포넌트용 메모 훅. 옵션 값이 바뀌지 않는 한 재질 1개를 유지한다(프로그램 수 예산). */
export function useLookdevMaterial(opts: LookdevMaterialOptions): MeshStandardNodeMaterial {
  return useMemo(
    () => createLookdevMaterial(opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 값 단위 비교
    [opts.color, opts.vertexColors, opts.roughness, opts.metalness],
  )
}
