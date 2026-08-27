import { DoubleSide, type Texture } from 'three'
import { attribute, texture, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'

export const SKILL_FX_ALPHA_TEST = 0.5

/** SkillFx와 LevelUpRing이 같은 인스턴스 속성/프로그램을 공유하는 단일 팩토리. */
export function createSkillFxMaterial(atlas: Texture): MeshBasicNodeMaterial {
  const uvRect = attribute('uvRect', 'vec4') as unknown as Node<'vec4'>
  const instanceColor = attribute('color', 'vec3') as unknown as Node<'vec3'>
  const frame = attribute('frame', 'float') as unknown as Node<'float'>
  const atlasUv = uv()
    .mul(uvRect.zw)
    .add(uvRect.xy)
    .add(vec2(frame.mul(uvRect.z), 0))
  const sampled = texture(atlas, atlasUv)
  const material = new MeshBasicNodeMaterial({
    map: atlas,
    alphaTest: SKILL_FX_ALPHA_TEST,
    side: DoubleSide,
    transparent: false,
    depthWrite: true,
    toneMapped: false,
  })
  material.colorNode = vec4(sampled.rgb.mul(instanceColor), sampled.a)
  // 수명 페이드(쿼드 축소)는 인스턴스 행렬 스케일로 한다 — positionNode 덮어쓰기는 인스턴스 행렬을 무시해
  // 모든 FX가 원점에 그려지는 결함이 있었다(2026-08-27 실빌드 실측).
  material.name = 'm6-shared-skill-fx-level-ring'
  material.userData = { sharedFxMaterial: true, instanceAttributes: ['uvRect', 'color', 'frame', 'life'] }
  return material
}
