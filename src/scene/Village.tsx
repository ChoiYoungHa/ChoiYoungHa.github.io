import { useGLTF } from '@react-three/drei'
import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import type { BufferGeometry, InstancedMesh, Material, Mesh, Texture } from 'three'
import { Color, Object3D } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { MeshStandardNodeMaterial } from 'three/webgpu'
import { useLookdevMaterial } from './Atmosphere'
import placement from '../data/placement.json'
import { classifyHouseMesh, getLookAssets, HOUSE_KEYS, readForceProcedural, type HouseKey } from '../systems/lookAssets'
import { sampleHeight } from './terrain/heightmap'
import { createHouseGeometry, HOUSE_SOCKETS, type HouseId } from './village/houseGeometry'
import { createRoofGeometry, ROOF_COLORS, type RoofId } from './village/roofGeometry'
import { VillageProps } from './village/Props'

const HOUSE_IDS: HouseId[] = ['house-a', 'house-b', 'house-c']
const ROOF_IDS: RoofId[] = ['roof-a', 'roof-b', 'roof-c']
const LOOK = getLookAssets()

interface VillageEntry {
  id: string
  house: HouseId
  roof: RoofId
  position: [number, number]
  rotationYDeg: number
  scale: number
}

const VILLAGE = placement.village as VillageEntry[]
/**
 * R103-A(D4-2) — GLB 집 높이 정규화. KayKit 집은 bbox 높이 0.93~1.4 단위(≈1m)라 미니어처로 보였다(R100 S2).
 * GLB 종별 bbox 높이로 균일 스케일 k = 목표/높이 를 구하고 placement.scale(0.85~1)은 상대 배율로 곱한다.
 * 콘티 목표 처마 4.5·용마루 6.5m → 6.0. 충돌 proxy(colliders/village.ts LOCAL_BOXES, 절차 집 기준 half 2.5~3.5)는
 * 스케일 후 GLB 발자국(a 5.1×5.5·b 4.1×5.2·c 5.0×5.7m)보다 크므로 그대로 둔다.
 */
export const HOUSE_TARGET_HEIGHT_METERS = 6.0

/** placement 한 채의 지면 위 변환(집 본체 기준). scaleMultiplier 는 GLB 높이 정규화 배율(절차 집은 1). */
function placeEntry(transform: Object3D, entry: VillageEntry, liftY: number, scaleMultiplier = 1) {
  const [x, z] = entry.position
  transform.position.set(x, sampleHeight(x, z) + liftY, z)
  transform.rotation.set(0, (entry.rotationYDeg * Math.PI) / 180, 0)
  transform.scale.setScalar(entry.scale * scaleMultiplier)
  transform.updateMatrix()
}

function Instances({
  name,
  geometry,
  entries,
  roof,
  material,
  instanceColors,
  scaleMultiplier = 1,
}: {
  name: string
  geometry: BufferGeometry
  entries: VillageEntry[]
  roof: boolean
  material: MeshStandardNodeMaterial
  /** R75-C — 인스턴스별 곱색(지붕 3변형). 없으면 instanceColor 미설정(=재질 색 그대로). */
  instanceColors?: Color[]
  /** R103-A — GLB 높이 정규화 배율. */
  scaleMultiplier?: number
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D()
    entries.forEach((entry, index) => {
      const socket = HOUSE_SOCKETS[entry.house]
      placeEntry(transform, entry, roof ? socket.position[1] * entry.scale : 0, scaleMultiplier)
      mesh.setMatrixAt(index, transform.matrix)
      if (instanceColors) mesh.setColorAt(index, instanceColors[index])
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [entries, roof, instanceColors, scaleMultiplier])

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

/** M2 — placement.json의 8채를 geometry 6종·공유 vertex-color 재질 1개로 그린다(절차 폴백). */
function VillageProcedural({ houseIds }: { houseIds: HouseId[] }) {
  // M3-05 (R30-A) — 거리 그레이딩 재질(공유 1개, 프로그램 예산 유지)
  const material = useLookdevMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })
  const houses = useMemo(
    () => Object.fromEntries(houseIds.map((id) => [id, createHouseGeometry(id)])) as Record<HouseId, BufferGeometry>,
    [houseIds],
  )
  const roofs = useMemo(
    () => Object.fromEntries(ROOF_IDS.map((id) => [id, createRoofGeometry(id)])) as Record<RoofId, BufferGeometry>,
    [],
  )
  const entries = VILLAGE.filter((entry) => houseIds.includes(entry.house))

  return (
    <>
      {houseIds.map((id) => (
        <Instances
          key={id}
          name={`village-${id}`}
          geometry={houses[id]}
          entries={entries.filter((entry) => entry.house === id)}
          roof={false}
          material={material}
        />
      ))}
      {ROOF_IDS.map((id) => (
        <Instances
          key={id}
          name={`village-${id}`}
          geometry={roofs[id]}
          entries={entries.filter((entry) => entry.roof === id)}
          roof
          material={material}
        />
      ))}
    </>
  )
}

interface HouseGltfParts {
  body: BufferGeometry | null
  cap: BufferGeometry | null
  map: Texture | undefined
  /** body+cap 합집합 bbox 높이(GLB 단위). R103-A 스케일 정규화에 쓴다. */
  height: number
}

function mapOf(material: Material | Material[]): Texture | undefined {
  const m = Array.isArray(material) ? material[0] : material
  return (m as { map?: Texture | null }).map ?? undefined
}

/** GLB 한 채를 body/cap 지오메트리 2개로 합친다(월드 변환 적용). 재질은 만들지 않는다 — 공유 재질 1개는 호출자가 만든다. */
function splitHouseGltf(scene: Object3D, url: string): HouseGltfParts {
  scene.updateMatrixWorld(true)
  const body: BufferGeometry[] = []
  const cap: BufferGeometry[] = []
  let map: Texture | undefined
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    // 정점색 재질이 아니므로 color 속성은 버린다(있으면 merge 불일치를 만든다).
    geometry.deleteAttribute('color')
    map ??= mapOf(mesh.material)
    ;(classifyHouseMesh(mesh.name) === 'cap' ? cap : body).push(geometry)
  })
  const merge = (pieces: BufferGeometry[]) => {
    if (pieces.length === 0) return null
    const merged = mergeGeometries(pieces, false)
    pieces.forEach((g) => g.dispose())
    if (!merged) throw new Error(`Could not merge house geometry: ${url}`)
    merged.computeBoundingSphere()
    return merged
  }
  const bodyG = merge(body)
  const capG = merge(cap)
  let minY = Infinity
  let maxY = -Infinity
  for (const g of [bodyG, capG]) {
    if (!g) continue
    g.computeBoundingBox()
    minY = Math.min(minY, g.boundingBox!.min.y)
    maxY = Math.max(maxY, g.boundingBox!.max.y)
  }
  const height = Number.isFinite(maxY - minY) && maxY - minY > 0 ? maxY - minY : 1
  return { body: bodyG, cap: capG, map, height }
}

/**
 * R75-C — GLB 집. 종별 body·cap InstancedMesh(있는 것만), **재질은 3종 8채가 공유 1개**(baseColor 텍스처는 첫 GLB 것).
 * 지붕/갓 3변형은 재질 복제가 아니라 `instanceColor`(ROOF_COLORS, 저채도 팔레트) 곱으로 낸다.
 */
function VillageGltf({ houses }: { houses: { id: HouseId; url: string }[] }) {
  const scenes = useGLTF(houses.map((h) => h.url)) as unknown as { scene: Object3D }[]
  const parts = useMemo(
    () => houses.map((h, i) => ({ id: h.id, parts: splitHouseGltf(scenes[i].scene, h.url) })),
    [houses, scenes],
  )
  const map = parts.find((p) => p.parts.map)?.parts.map
  const material = useLookdevMaterial({ map, color: map ? undefined : '#b5aa91', roughness: 0.9, metalness: 0 })
  const white = useMemo(() => new Color('#ffffff'), [])

  return (
    <>
      {parts.map(({ id, parts: p }) => {
        const entries = VILLAGE.filter((entry) => entry.house === id)
        const capColors = entries.map((entry) => new Color(ROOF_COLORS[entry.roof]))
        const bodyColors = entries.map(() => white)
        const k = HOUSE_TARGET_HEIGHT_METERS / p.height
        return (
          <group key={id} name={`village-${id}`} userData={{ source: 'gltf', heightUnits: p.height, scaleMultiplier: k }}>
            {p.body && (
              <Instances name={`village-${id}-body`} geometry={p.body} entries={entries} roof={false} material={material} instanceColors={bodyColors} scaleMultiplier={k} />
            )}
            {p.cap && (
              <Instances name={`village-${id}-cap`} geometry={p.cap} entries={entries} roof={false} material={material} instanceColors={capColors} scaleMultiplier={k} />
            )}
          </group>
        )
      })}
    </>
  )
}

/**
 * 마을. 종별로 `public/models/house_{a,b,c}.glb` 가 빌드 시 있으면 GLB, 없으면 절차 집·지붕.
 * GLB 로딩 중(Suspense)에는 그 종도 절차 폴백으로 보여 App 의 "로딩 중에도 마을은 보인다" 계약을 지킨다.
 */
export function Village() {
  const gltfHouses = HOUSE_KEYS.flatMap((key) => {
    const entry = LOOK.village[key as HouseKey]
    return entry.mode === 'gltf' ? [{ id: key as HouseId, url: entry.url }] : []
  })
  const proceduralIds = HOUSE_IDS.filter((id) => !gltfHouses.some((h) => h.id === id))
  const propsEnabled = !readForceProcedural(location.search)

  return (
    <group name="village">
      {proceduralIds.length > 0 && <VillageProcedural houseIds={proceduralIds} />}
      {gltfHouses.length > 0 && (
        <Suspense fallback={<VillageProcedural houseIds={gltfHouses.map((h) => h.id)} />}>
          <VillageGltf houses={gltfHouses} />
        </Suspense>
      )}
      <VillageProps enabled={propsEnabled} />
    </group>
  )
}

for (const key of HOUSE_KEYS) {
  const entry = LOOK.village[key]
  if (entry.mode === 'gltf') useGLTF.preload(entry.url)
}
