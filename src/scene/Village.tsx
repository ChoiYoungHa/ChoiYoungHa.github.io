import { useLayoutEffect, useMemo, useRef } from 'react'
import type { BufferGeometry, InstancedMesh } from 'three'
import { Object3D } from 'three'
import type { MeshStandardNodeMaterial } from 'three/webgpu'
import { useLookdevMaterial } from './Atmosphere'
import placement from '../data/placement.json'
import { sampleHeight } from './terrain/heightmap'
import { createHouseGeometry, HOUSE_SOCKETS, type HouseId } from './village/houseGeometry'
import { createRoofGeometry, type RoofId } from './village/roofGeometry'

const HOUSE_IDS: HouseId[] = ['house-a', 'house-b', 'house-c']
const ROOF_IDS: RoofId[] = ['roof-a', 'roof-b', 'roof-c']

interface VillageEntry {
  id: string
  house: HouseId
  roof: RoofId
  position: [number, number]
  rotationYDeg: number
  scale: number
}

const VILLAGE = placement.village as VillageEntry[]

function Instances({
  name,
  geometry,
  entries,
  roof,
  material,
}: {
  name: string
  geometry: BufferGeometry
  entries: VillageEntry[]
  roof: boolean
  material: MeshStandardNodeMaterial
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D()
    entries.forEach((entry, index) => {
      const [x, z] = entry.position
      const socket = HOUSE_SOCKETS[entry.house]
      const y = sampleHeight(x, z) + (roof ? socket.position[1] * entry.scale : 0)
      transform.position.set(x, y, z)
      transform.rotation.set(0, (entry.rotationYDeg * Math.PI) / 180, 0)
      transform.scale.setScalar(entry.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [entries, roof])

  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, entries.length]}
      castShadow
      receiveShadow
    />
  )
}

/** placement.json의 8채를 geometry 6종·공유 vertex-color 재질 1개로 그린다. */
export function Village() {
  // M3-05 (R30-A) — 거리 그레이딩 재질(공유 1개, 프로그램 예산 유지)
  const material = useLookdevMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  const houses = useMemo(
    () => Object.fromEntries(HOUSE_IDS.map((id) => [id, createHouseGeometry(id)])) as Record<HouseId, BufferGeometry>,
    [],
  )
  const roofs = useMemo(
    () => Object.fromEntries(ROOF_IDS.map((id) => [id, createRoofGeometry(id)])) as Record<RoofId, BufferGeometry>,
    [],
  )

  return (
    <group name="village">
      {HOUSE_IDS.map((id) => (
        <Instances
          key={id}
          name={`village-${id}`}
          geometry={houses[id]}
          entries={VILLAGE.filter((entry) => entry.house === id)}
          roof={false}
          material={material}
        />
      ))}
      {ROOF_IDS.map((id) => (
        <Instances
          key={id}
          name={`village-${id}`}
          geometry={roofs[id]}
          entries={VILLAGE.filter((entry) => entry.roof === id)}
          roof
          material={material}
        />
      ))}
    </group>
  )
}
