import type { Material, Mesh, Object3D } from 'three'
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface BakeVertexColorOptions {
  /** bottom(기본): bbox 바닥 중심을 원점으로. top: 상단 부착점(덩굴처럼 매달리는 것). */
  pivot?: 'bottom' | 'top'
  /** 재질 색을 휘도 쪽으로 섞는 비율(0=원색). 코덱스 팩터 색은 채도가 높아 §6-2 팔레트(채도 상한)에 맞춰 살짝 뺀다. */
  desaturate?: number
  /** 전체 곱색(예: 석상 회색화). */
  tint?: Color
}

export interface BakedVertexColorGlb {
  geometry: BufferGeometry
  height: number
  triangles: number
}

/**
 * 2026-08-28 (룩 심사안 #5) — 코덱스 GLB(텍스처 0, 재질 색 팩터만)를 **정점색 1개 지오메트리**로 굽는다.
 * `bakeGlb`(재질 그룹 유지)는 InstancedMesh 1개가 재질 수만큼 draw call 을 내지만, 이 경로는 종당 1 call 이고
 * RockInstances 와 같은 `useLookdevMaterial({ vertexColors: true })` 노드그래프를 공유해 파이프라인도 늘지 않는다.
 */
export function bakeGlbVertexColor(scene: Object3D, options: BakeVertexColorOptions = {}): BakedVertexColorGlb {
  const desaturate = options.desaturate ?? 0.25
  scene.updateMatrixWorld(true)
  const parts: BufferGeometry[] = []
  const scratch = new Color()
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh !== true) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
    if (geometry.index === null) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material & { color?: Color }
    scratch.copy(material.color ?? new Color(0.6, 0.6, 0.6))
    if (desaturate > 0) {
      const l = 0.2126 * scratch.r + 0.7152 * scratch.g + 0.0722 * scratch.b
      scratch.lerp(new Color(l, l, l), desaturate)
    }
    if (options.tint) scratch.multiply(options.tint)
    const count = geometry.attributes.position.count
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) { colors[i * 3] = scratch.r; colors[i * 3 + 1] = scratch.g; colors[i * 3 + 2] = scratch.b }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    parts.push(geometry)
  })
  if (parts.length === 0) throw new Error(`bakeGlbVertexColor: no mesh in ${scene.name}`)
  const merged = parts.length === 1 ? parts[0] : (mergeGeometries(parts, false) as BufferGeometry | null)
  if (merged === null) throw new Error('bakeGlbVertexColor: merge failed')
  merged.computeBoundingBox()
  const box = merged.boundingBox
  const size = new Vector3()
  if (box !== null) {
    box.getSize(size)
    const cx = (box.min.x + box.max.x) * 0.5
    const cz = (box.min.z + box.max.z) * 0.5
    merged.translate(-cx, options.pivot === 'top' ? -box.max.y : -box.min.y, -cz)
  }
  merged.computeBoundingSphere()
  return { geometry: merged, height: size.y, triangles: (merged.index?.count ?? merged.attributes.position.count) / 3 }
}
