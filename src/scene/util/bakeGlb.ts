import type { Material, Mesh, Object3D } from 'three'
import { BufferGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface BakedGlb {
  geometry: BufferGeometry
  /** 프리미티브(재질)별 그룹을 보존한 재질 배열. InstancedMesh 에 그대로 넘긴다. */
  materials: Material[]
  /** 월드 기준 높이(m). 원점은 바닥 중심으로 옮겨져 있다. */
  height: number
}

/**
 * 2026-08-28 (master) — 코덱스 GLB(프리미티브 여러 개 = three 에서 Mesh 여러 개)를 **재질 그룹을 유지한 채**
 * 하나의 지오메트리로 굽는다. 종별 InstancedMesh 1개(draw call = 재질 수)로 그릴 수 있다.
 * 같은 재질을 쓰는 프리미티브는 하나의 그룹으로 합친다. 원점은 bbox 바닥 중심으로 정규화한다(코덱스 규격: ground-center).
 */
export function bakeGlb(scene: Object3D): BakedGlb {
  scene.updateMatrixWorld(true)
  const meshes: Mesh[] = []
  scene.traverse((object) => { const mesh = object as Mesh; if (mesh.isMesh === true) meshes.push(mesh) })
  if (meshes.length === 0) throw new Error(`bakeGlb: no mesh in ${scene.name}`)

  const materials: Material[] = []
  const byMaterial = new Map<Material, BufferGeometry[]>()
  for (const mesh of meshes) {
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    // mergeGeometries 는 속성 집합이 같아야 한다 — 색/uv1 등 부가 속성은 버린다.
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geometry.deleteAttribute(name)
    if (geometry.index === null) geometry.setIndex([...Array(geometry.attributes.position.count).keys()])
    const list = byMaterial.get(material)
    if (list === undefined) { byMaterial.set(material, [geometry]); materials.push(material) } else list.push(geometry)
  }
  const perMaterial = materials.map((material) => {
    const parts = byMaterial.get(material) as BufferGeometry[]
    const merged = parts.length === 1 ? parts[0] : (mergeGeometries(parts, false) as BufferGeometry)
    if (merged === null) throw new Error('bakeGlb: merge failed')
    return merged
  })
  const geometry = perMaterial.length === 1 ? perMaterial[0] : (mergeGeometries(perMaterial, true) as BufferGeometry)
  if (geometry === null) throw new Error('bakeGlb: group merge failed')
  if (perMaterial.length === 1) geometry.addGroup(0, geometry.index?.count ?? geometry.attributes.position.count, 0)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = new Vector3()
  if (box !== null) {
    box.getSize(size)
    geometry.translate(-(box.min.x + box.max.x) * 0.5, -box.min.y, -(box.min.z + box.max.z) * 0.5)
  }
  geometry.computeBoundingSphere()
  return { geometry, materials, height: size.y }
}
