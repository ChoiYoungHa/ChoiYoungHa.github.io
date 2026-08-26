/**
 * M3-05B/C/D 대기원근 그레이딩 — three 비의존 순수 수학 (계획서 §6-2).
 *
 * 이 파일은 셰이더가 아니라 **참조 구현**이다. Node 에서 결정론적으로 검증하고
 * (`Automation/test-depth-grade.mjs`), 같은 식을 `depthGradeNode.ts` 가 TSL 로 옮긴다.
 * 두 파일의 수식이 다르면 TSL 쪽이 틀린 것이다.
 *
 * 단계(§6-2 표, 순서 고정 B→C→D):
 *   depthFactor = smoothstep(40m, 260m, viewDistance)
 *   B 채도 감쇄  saturation *= mix(1, 0.25, depthFactor)
 *   C 색상 시프트 hue = mixHue(hue_near, 210°, depthFactor * 0.85)   (최단 호)
 *   D 휘도 상승  lightness += depthFactor * 0.35  (0~1 클램프)
 *
 * 색 공간: 입력·출력 rgb 는 0~1. HSL 은 measure.mjs 와 같은 정의(HSL S, hue 0~360).
 * 주의: 셰이더에서는 이 식이 **선형(pre-tonemap) 색**에 걸리고, measure.mjs 는 **sRGB 8bit 캡처**를 잰다.
 * 그래서 §6-2 파라미터는 출발값이며 최종값은 measure.mjs 로 튜닝한다(Docs/lookdev/m3-plan.md).
 *
 * 아직 어디서도 import 하지 않는다 — M3-05B~D 에서 Atmosphere.tsx 가 연결한다.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsl {
  /** 0~360 */
  h: number
  /** 0~1 */
  s: number
  /** 0~1 */
  l: number
}

export interface DepthGradeParams {
  /** depthFactor 가 0 인 거리(m) */
  nearMeters: number
  /** depthFactor 가 1 인 거리(m) */
  farMeters: number
  /** B: 원경에서 채도에 곱하는 값 (mix(1, satFar, f)) */
  satFar: number
  /** C: 원경 목표 hue(°) */
  hueFarDeg: number
  /** C: hue 이동 비율 상한 (f * hueStrength) */
  hueStrength: number
  /** D: 원경에서 더하는 lightness (f * lumaGain) */
  lumaGain: number
}

/** 계획서 §6-2 표 그대로. */
export const DEPTH_GRADE_DEFAULTS: DepthGradeParams = {
  nearMeters: 40,
  farMeters: 260,
  satFar: 0.25,
  hueFarDeg: 210,
  hueStrength: 0.85,
  lumaGain: 0.35,
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** GLSL smoothstep. edge0 ≥ edge1 이면 step 처럼 동작한다. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function depthFactor(viewDistance: number, p: DepthGradeParams = DEPTH_GRADE_DEFAULTS): number {
  return smoothstep(p.nearMeters, p.farMeters, viewDistance)
}

/** measure.mjs 의 rgbToHsl 과 같은 결과(0~1 입력). */
export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  if (s === 0) return { r: l, g: l, b: l }
  const hue = (((h % 360) + 360) % 360) / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t0: number): number => {
    let t = t0
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return { r: channel(hue + 1 / 3), g: channel(hue), b: channel(hue - 1 / 3) }
}

/** 최단 호로 hue 를 섞는다. t=1 이면 정확히 b. 결과 0~360. */
export function mixHue(a: number, b: number, t: number): number {
  let delta = (((b - a) % 360) + 540) % 360 - 180 // -180 ~ 180
  if (delta === -180) delta = 180
  return (((a + delta * t) % 360) + 360) % 360
}

/** 셰이더용 luma(선형 rgb 기준)와 같은 계수. measure.mjs 의 luma709 와 같은 식(0~1 스케일). */
export function luma709({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** depthFactor f(0~1) 를 HSL 에 B→C→D 순으로 적용한다. */
export function gradeHsl(hsl: Hsl, f: number, p: DepthGradeParams = DEPTH_GRADE_DEFAULTS): Hsl {
  const s = hsl.s * (1 + (p.satFar - 1) * f) // mix(1, satFar, f)
  const h = mixHue(hsl.h, p.hueFarDeg, f * p.hueStrength)
  const l = clamp01(hsl.l + f * p.lumaGain)
  return { h, s: clamp01(s), l }
}

/** rgb(0~1) 에 거리 d(m) 의 그레이딩을 적용한 rgb 를 돌려준다. */
export function applyDepthGrade(rgb: Rgb, viewDistance: number, p: DepthGradeParams = DEPTH_GRADE_DEFAULTS): Rgb {
  const f = depthFactor(viewDistance, p)
  if (f === 0) return { ...rgb }
  return hslToRgb(gradeHsl(rgbToHsl(rgb), f, p))
}
