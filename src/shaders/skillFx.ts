import { DoubleSide, type Texture } from 'three'
import { attribute, positionLocal, texture, uv, vec2, vec4 } from 'three/tsl'
import { MeshBasicNodeMaterial, type Node } from 'three/webgpu'

export const SKILL_FX_ALPHA_TEST = 0.5

/** SkillFx와 LevelUpRing이 같은 인스턴스 속성/프로그램을 공유하는 단일 팩토리. */
export function createSkillFxMaterial(atlas: Texture): MeshBasicNodeMaterial {
  const uvRect = attribute('uvRect', 'vec4') as unknown as Node<'vec4'>
  const instanceColor = attribute('color', 'vec3') as unknown as Node<'vec3'>
  const frame = attribute('frame', 'float') as unknown as Node<'float'>
  const life = (attribute('life', 'float') as unknown as Node<'float'>).clamp(0, 1)
  const center = attribute('center', 'vec3') as unknown as Node<'vec3'>
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
  // 컷아웃 알파는 바꾸지 않고 쿼드 자체를 줄여 수명 페이드를 표현한다.
  material.positionNode = positionLocal.sub(center).mul(life).add(center)
  material.name = 'm6-shared-skill-fx-level-ring'
  material.userData = { sharedFxMaterial: true, instanceAttributes: ['uvRect', 'color', 'frame', 'life', 'center'] }
  return material
}
