import { useGLTF } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BufferGeometry, InstancedMesh, Material, Mesh, Object3D, Texture } from 'three'
import { Object3D as Transform } from 'three'
import { luminance, mix, texture, uv, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import placement from '../../data/placement.json'
import { useLookdevMaterial } from '../Atmosphere'
import { sampleHeight } from '../terrain/heightmap'
import { PROP_KINDS, propRuntimeScale, type PropKind, type PropPlacement } from './propsLayout'

const PROP_URLS: Record<PropKind, string> = {
  fence: '/models/prop_fence.glb',
  stonewall: '/models/prop_stonewall.glb',
  arch: '/models/prop_arch.glb',
  banner: '/models/prop_banner.glb',
}
const PROP_URL_LIST = PROP_KINDS.map((kind) => PROP_URLS[kind])

const PROP_LIFT_Y: Record<PropKind, number> = {
  fence: 0,
  stonewall: 0,
  arch: 0,
  // R103-A: 현수막은 접지(heightmap) + 0.05m — 2.4m 부유(R100 S2)를 없앤다. 집이 6m 로 커져 벽 옆 지면에 세워도 자연스럽다.
  banner: 0.05,
}
/**
 * R103-A — 소품 탈채도. 곱색(color)은 채도가 있는 아틀라스(주황 울타리 → S2 근경 채도 65%)를 탈채도할 수 없어(실측 곱색 #E5E2DC 로 변화 0)
 * colorNode 로 텍스처 rgb 를 자기 휘도(무채색) 쪽으로 0.4 섞는다(재질 1개, 프로그램은 colorNode 변형 1). 목표 S2 근경 채도 ≤45%.
 */
export const PROP_DESATURATE = 0.65 // R103-A: 0.4 → S2 근경 채도 65.8→58.2(목표 ≤45) 미달이라 0.65
function propColorNode(map: Texture): Node<'vec3'> {
  const rgb = texture(map, uv()).rgb
  return mix(rgb, vec3(luminance(rgb)), PROP_DESATURATE) as unknown as Node<'vec3'>
}

const PROPS = placement.props as PropPlacement[]

function mapOf(material: Material | Material[]): Texture | undefined {
  const first = Array.isArray(material) ? material[0] : material
  return (first as { map?: Texture | null }).map ?? undefined
}

function firstMap(scene: Object3D): Texture | undefined {
  let map: Texture | undefined
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!map && mesh.isMesh) map = mapOf(mesh.material)
  })
  return map
}

/** Merge a prop's child meshes and normalize its placement origin to XZ center / ground Y. */
function normalizedGeometry(scene: Object3D, url: string): BufferGeometry {
  scene.updateMatrixWorld(true)
  const pieces: BufferGeometry[] = []
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    pieces.push(geometry)
  })
  const geometry = mergeGeometries(pieces, false)
  pieces.forEach((piece) => piece.dispose())
  if (!geometry) throw new Error(`Could not merge village prop geometry: ${url}`)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) throw new Error(`Village prop has no bounds: ${url}`)
  geometry.translate(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2)
  geometry.computeBoundingSphere()
  return geometry
}

function PropInstances({ kind, geometry, entries, material }: {
  kind: PropKind
  geometry: BufferGeometry
  entries: PropPlacement[]
  material: Material
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Transform()
    entries.forEach((entry, index) => {
      const [x, z] = entry.position
      transform.position.set(x, sampleHeight(x, z) + PROP_LIFT_Y[kind], z)
      transform.rotation.set(0, entry.yaw, 0)
      transform.scale.setScalar(propRuntimeScale(kind)) // R103-A: placement.scale 대신 실제 높이 정규화
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [entries, kind])

  return (
    <instancedMesh
      ref={ref}
      name={`village-prop-${kind}`}
      args={[geometry, material, entries.length]}
      castShadow={kind === 'arch'}
      receiveShadow
      userData={{ collision: 'none', source: 'gltf' }}
    />
  )
}

function LoadedVillageProps() {
  const gltfs = useGLTF(PROP_URL_LIST) as unknown as { scene: Object3D }[]
  const geometries = useMemo(
    () => Object.fromEntries(PROP_KINDS.map((kind, index) => [kind, normalizedGeometry(gltfs[index].scene, PROP_URL_LIST[index])])) as Record<PropKind, BufferGeometry>,
    [gltfs],
  )
  // R78-A: all four source GLBs embed the same atlas SHA-256, so one runtime material is shared.
  const map = firstMap(gltfs[0].scene)
  const colorNode = useMemo(() => (map ? propColorNode(map) : undefined), [map])
  const material = useLookdevMaterial({ map, colorNode, roughness: 0.9, metalness: 0 })

  return (
    <group name="village-props">
      {PROP_KINDS.map((kind) => (
        <PropInstances
          key={kind}
          kind={kind}
          geometry={geometries[kind]}
          entries={PROPS.filter((entry) => entry.kind === kind)}
          material={material}
        />
      ))}
    </group>
  )
}

/** Probe static files first so an absent optional GLB quietly renders zero props. */
function usePropsAvailable(enabled: boolean): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let live = true
    Promise.all(
      Object.values(PROP_URLS).map(async (url) => {
        try {
          const response = await fetch(url, { method: 'HEAD' })
          return response.ok && !response.headers.get('content-type')?.includes('text/html')
        } catch {
          return false
        }
      }),
    ).then((results) => {
      if (live) setAvailable(results.every(Boolean))
    })
    return () => {
      live = false
    }
  }, [enabled])
  return enabled && available
}

export function VillageProps({ enabled }: { enabled: boolean }) {
  const available = usePropsAvailable(enabled)
  if (!available) return null
  return (
    <Suspense fallback={null}>
      <LoadedVillageProps />
    </Suspense>
  )
}
