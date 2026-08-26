import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh, Material, Mesh, Object3D } from 'three'
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Object3D as Transform, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import lookdev from '../data/lookdev.json'
import mainPath from '../data/main-path.json'
import vistas from '../data/vistas.json'
import { useRuntime } from '../store/useRuntime'
import { WORLD_HALF_EXTENT, WORLD_SIZE } from './bounds'
import { createPathExclusion, createVistaExclusion } from './scatter/exclusionMask'
import { useLookdevMaterial } from './Atmosphere'
import { lodConfigForPreset } from './foliage/lodConfig'
import { buildGrassLiteGeometry } from './foliage/grassLiteGeometry'
import { hashSeed, scatter, type ScatterPoint } from './scatter/seededRandom'
import { createSlopeExclusion, type SampleHeight } from './scatter/slopeMask'

const MODEL_URL = '/models/vegetation_kit.glb'
const SPECIES = ['grass', 'flower_yellowA', 'plant_bush'] as const
const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
/** M1-20 — vista 시선 통로에는 산포하지 않는다. */
const VISTA_LINES = vistas.markers.map((m) => ({ position: m.position, target: m.target }))
const MAX_WORLD_CANDIDATES = 200_000

interface PlacedPoint extends ScatterPoint {
  y: number
}

interface LoadedModel {
  scene: Object3D
}

export interface FoliageProps {
  sampleHeight: SampleHeight
}

/**
 * M3-06·M3-08 (R30-A) — 종별 정점 색을 팔레트로 고정한다. 이전엔 GLB 재질 색(Kenney 키트의 고채도 청록 계열)을
 * 그대로 구워 R21·R24 에서 "식생이 청록" 으로 보고됐다(m2-vista 원경 hue 234°). §6-2 수목/식생 #3B3E26 기준.
 */
const SPECIES_COLOR: Record<(typeof SPECIES)[number], string> = {
  grass: '#3b3e26',
  flower_yellowA: '#5c5834', // 저채도 황록 — 꽃은 살짝 밝게, 채도 상한 §6-2 28% 안
  plant_bush: '#363a25',
}

function materialColor(_material: Material | Material[], species: string): Color {
  return new Color(SPECIES_COLOR[species as (typeof SPECIES)[number]] ?? '#3b3e26')
}

/** 여러 원본 재질을 vertex color로 굽혀 종별 draw call을 하나로 만든다. */
function geometryForSpecies(scene: Object3D, species: string): BufferGeometry {
  scene.updateMatrixWorld(true)
  const root = scene.getObjectByName(species)
  if (!root) throw new Error(`Missing foliage species in ${MODEL_URL}: ${species}`)

  const pieces: BufferGeometry[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    const color = materialColor(mesh.material, species)
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    pieces.push(geometry)
  })

  const merged = mergeGeometries(pieces, false)
  pieces.forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error(`Could not merge foliage geometry: ${species}`)
  merged.computeBoundingSphere()
  return merged
}

export function readGrassLiteEnabled(search: string = location.search): boolean {
  const query = new URLSearchParams(search).get('grassLite')
  if (query === '1') return true
  if (query === '0') return false
  return lookdev.grassLite.enabled
}

function grassLiteGeometry(): BufferGeometry {
  const data = buildGrassLiteGeometry(lookdev.grassLite.seed)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
  geometry.setAttribute('color', new BufferAttribute(data.colors, 3))
  geometry.setIndex(new BufferAttribute(data.index, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function SpeciesInstances({
  name,
  geometry,
  points,
  maxDistance,
  maxVisible,
}: {
  name: string
  geometry: BufferGeometry
  points: PlacedPoint[]
  /** M1-24 종별 최대 표시 거리(m). 이보다 먼 instance 는 draw 하지 않는다. */
  maxDistance: number
  maxVisible: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Transform(), [])
  const lastCamera = useRef(new Vector3(Infinity, Infinity, Infinity))
  // M3-05 (R30-A) — 거리 그레이딩 재질(종별 1개)
  const material = useLookdevMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0
    lastCamera.current.set(Infinity, Infinity, Infinity)
  }, [points, maxDistance, maxVisible])

  // M1-24 — 카메라 거리 밖 instance 표시 0.
  // `mesh.count` 를 줄이면 그 뒤 instance 는 아예 제출되지 않는다.
  // 카메라가 2m 이상 움직였을 때만 다시 채운다(매 프레임 수천 회 행렬 쓰기 방지).
  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    if (camera.position.distanceToSquared(lastCamera.current) < 4) return
    lastCamera.current.copy(camera.position)

    let visible = 0
    for (const p of points) {
      if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > maxDistance) continue
      transform.position.set(p.x, p.y, p.z)
      transform.rotation.set(0, p.rotationY, 0)
      transform.scale.setScalar(p.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(visible, transform.matrix)
      visible += 1
      if (visible >= maxVisible) break
    }
    mesh.count = visible
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh ref={ref} name={`foliage-${name}`} args={[geometry, material, maxVisible]} />
  )
}

/** 계획서 §3-2/§3-6: 종별 InstancedMesh 3개, low/base 밀도와 반경 적용. */
export function Foliage({ sampleHeight }: FoliageProps) {
  const { scene } = useGLTF(MODEL_URL) as unknown as LoadedModel
  const preset = useRuntime((state) => state.preset)
  const lod = lodConfigForPreset(preset)
  const grassLiteEnabled = readGrassLiteEnabled()

  const geometries = useMemo(
    () => SPECIES.map((species) => species === 'grass' && grassLiteEnabled
      ? grassLiteGeometry()
      : geometryForSpecies(scene, species)),
    [grassLiteEnabled, scene],
  )
  const visibleCounts = useMemo(() => {
    const total = lod.grassInstances.count
    const counts = [Math.floor(total * 0.7), Math.floor(total * 0.2)]
    counts.push(total - counts[0] - counts[1])
    return counts
  }, [lod.grassInstances.count])
  const pointSets = useMemo(() => {
    const radius = lod.grassInstances.radius
    const density = lod.grassInstances.count / (Math.PI * radius * radius)
    const candidateTotal = Math.min(MAX_WORLD_CANDIDATES, Math.ceil(density * WORLD_SIZE * WORLD_SIZE))
    const counts = [Math.floor(candidateTotal * 0.7), Math.floor(candidateTotal * 0.2)]
    counts.push(candidateTotal - counts[0] - counts[1])
    const pathReject = createPathExclusion(CENTERLINE, 2)
    const slopeReject = createSlopeExclusion(sampleHeight)
    const vistaReject = createVistaExclusion(VISTA_LINES)
    const reject = (x: number, z: number) =>
      pathReject(x, z) || slopeReject(x, z) || vistaReject(x, z)

    return SPECIES.map((species, index) =>
      scatter(hashSeed(`m1-${species}`), {
        count: counts[index],
        halfExtent: WORLD_HALF_EXTENT,
        scaleMin: index === 0 ? 0.75 : 0.85,
        scaleMax: index === 0 ? 1.2 : 1.35,
        reject,
      }).map((point) => ({ ...point, y: sampleHeight(point.x, point.z) })),
    )
  }, [lod.grassInstances.count, lod.grassInstances.radius, sampleHeight])

  // This GLB has no lower-detail conifer meshes yet, so retain the existing
  // grass-radius cull and expose the planned conifer bands on the scene node.
  const maxDistance = Math.min(lod.grassInstances.radius, lod.coniferLodDistances[2])

  return (
    <group name="foliage-instances" userData={{ lodDistances: lod.coniferLodDistances }}>
      {SPECIES.map((species, index) => (
        <SpeciesInstances
          key={species}
          name={species}
          geometry={geometries[index]}
          points={pointSets[index]}
          maxDistance={maxDistance}
          maxVisible={visibleCounts[index]}
        />
      ))}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
