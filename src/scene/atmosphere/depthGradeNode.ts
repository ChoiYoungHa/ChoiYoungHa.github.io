/**
 * M3-05B/C/D 대기원근 그레이딩 — TSL 노드 (계획서 §6-2 B·C·D).
 *
 * `depthGradeMath.ts` 의 참조 구현을 three 0.185 TSL 로 옮긴 것이다. 수식은 그 파일이 정본이고,
 * 여기서는 분기 없는(branchless) RGB↔HSV↔HSL 변환으로 같은 결과를 낸다(WebGPU/WGSL·WebGL2/GLSL 양쪽 컴파일).
 *
 * 연결하지 않는다 — M3-05B~D 에서 `Atmosphere.tsx` 가 연결한다. 연결 방법(NodeMaterial.js L537~547 실측):
 *   material.outputNode = depthGradeOutput(params)
 *   · `output` 프로퍼티 노드 = 조명·안개(setupFog)까지 끝난 **선형** 색. 톤매핑·sRGB 는 그 뒤 renderer 출력 단계에서 걸린다.
 *   · 따라서 그레이딩은 pre-tonemap 선형 공간에서 일어난다. measure.mjs 가 재는 sRGB 8bit 값과 1:1 이 아니므로
 *     §6-2 파라미터는 출발값이고 최종값은 측정으로 튜닝한다(Docs/lookdev/m3-plan.md).
 *   · R3F 의 `<meshStandardMaterial>`(classic, from 'three') 에는 outputNode 가 없다. 연결 시 `three/webgpu` 의
 *     `MeshStandardNodeMaterial` 을 `extend` 해 `<meshStandardNodeMaterial outputNode={…}>` 로 바꿔야 한다
 *     (Terrain·MainPath·HeroTree·Foliage·RockInstances·Village·Controller 7곳).
 *   · scene.background(HDR 하늘)는 재질이 아니라 이 노드의 영향을 받지 않는다. 하늘 휘도는 backgroundIntensity 로 잡는다.
 *
 * 거리: `positionView` 의 길이 = 카메라에서 프래그먼트까지 뷰 공간 거리(m). 지형 좌표가 미터 단위라 그대로 쓴다.
 */
import {
  Fn,
  abs,
  clamp,
  float,
  fract,
  length,
  max,
  min,
  mix,
  output,
  positionView,
  smoothstep,
  step,
  vec3,
  vec4,
} from 'three/tsl'
import type { Node } from 'three/webgpu'
import { DEPTH_GRADE_DEFAULTS, type DepthGradeParams } from './depthGradeMath'

export type { DepthGradeParams }
export { DEPTH_GRADE_DEFAULTS }

const EPS = 1e-10

/** RGB(0~1) → HSV. Sam Hocevar 의 branchless 식. */
export const rgbToHsvNode = /*@__PURE__*/ Fn(([c]: [Node<'vec3'>]) => {
  const K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0)
  const p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g))
  const q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r))
  const d = q.x.sub(min(q.w, q.y))
  const h = abs(q.z.add(q.w.sub(q.y).div(d.mul(6.0).add(EPS))))
  const s = d.div(q.x.add(EPS))
  return vec3(h, s, q.x)
})

/** HSV → RGB(0~1). */
export const hsvToRgbNode = /*@__PURE__*/ Fn(([c]: [Node<'vec3'>]) => {
  const p = abs(fract(c.x.add(vec3(0.0, 2.0 / 3.0, 1.0 / 3.0))).mul(6.0).sub(3.0))
  return c.z.mul(mix(vec3(1.0), clamp(p.sub(1.0), 0.0, 1.0), c.y))
})

/** HSV → HSL (h 그대로, s·l 변환). measure.mjs 의 HSL S 와 같은 정의. */
export const hsvToHslNode = /*@__PURE__*/ Fn(([c]: [Node<'vec3'>]) => {
  const v = c.z
  const l = v.mul(float(1.0).sub(c.y.mul(0.5)))
  const denom = min(l, float(1.0).sub(l))
  const s = v.sub(l).div(denom.add(EPS))
  return vec3(c.x, s, l)
})

/** HSL → HSV. */
export const hslToHsvNode = /*@__PURE__*/ Fn(([c]: [Node<'vec3'>]) => {
  const l = c.z
  const v = l.add(c.y.mul(min(l, float(1.0).sub(l))))
  const s = float(2.0).mul(float(1.0).sub(l.div(v.add(EPS))))
  return vec3(c.x, s, v)
})

/** 최단 호 hue 보간(0~1 단위). depthGradeMath.mixHue 와 같다. */
export const mixHueNode = /*@__PURE__*/ Fn(
  ([a, b, t]: [Node<'float'>, Node<'float'>, Node<'float'>]) => {
    // delta ∈ (-0.5, 0.5]
    const delta = fract(b.sub(a).add(0.5)).sub(0.5)
    return fract(a.add(delta.mul(t)))
  },
)

/** depthFactor = smoothstep(near, far, |positionView|) */
export function depthFactorNode(p: DepthGradeParams = DEPTH_GRADE_DEFAULTS) {
  return smoothstep(float(p.nearMeters), float(p.farMeters), length(positionView))
}

/**
 * 색(rgb 0~1 이상 가능 — HDR 선형)과 depthFactor 를 받아 B→C→D 를 적용한 rgb 를 돌려주는 Fn 을 만든다.
 * HDR 값(>1)은 HSV 변환이 v>1 로 그대로 들고 가므로 클램프하지 않는다. lightness 만 0~1 로 클램프한다.
 */
export function makeDepthGrade(p: DepthGradeParams = DEPTH_GRADE_DEFAULTS) {
  const satFar = float(p.satFar)
  const hueFar = float(p.hueFarDeg / 360)
  const hueStrength = float(p.hueStrength)
  const lumaGain = float(p.lumaGain)

  return /*@__PURE__*/ Fn(([rgb, f]: [Node<'vec3'>, Node<'float'>]) => {
    const hsl = hsvToHslNode(rgbToHsvNode(rgb))
    // B 채도 감쇄
    const s = hsl.y.mul(mix(float(1.0), satFar, f))
    // C 색상 시프트 (최단 호)
    const h = mixHueNode(hsl.x, hueFar, f.mul(hueStrength))
    // D 휘도 상승
    const l = clamp(hsl.z.add(f.mul(lumaGain)), 0.0, 1.0)
    return hsvToRgbNode(hslToHsvNode(vec3(h, max(s, 0.0), l)))
  })
}

/**
 * `material.outputNode` 에 바로 꽂는 노드: 조명·안개가 끝난 `output` 색에 거리 그레이딩을 건다. 알파는 보존.
 *   material.outputNode = depthGradeOutput()
 */
export function depthGradeOutput(p: DepthGradeParams = DEPTH_GRADE_DEFAULTS) {
  const grade = makeDepthGrade(p)
  const f = depthFactorNode(p)
  return vec4(grade(output.rgb, f), output.a)
}
