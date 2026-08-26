import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { InstancedMesh, Material, Mesh, Object3D } from 'three'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D as Transform, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import mainPath from '../data/main-path.json'
import vistas from '../data/vistas.json'
import qualityPresets from '../data/quality-presets.json'
import { useRuntime } from '../store/useRuntime'
import { createPathExclusion, createVistaExclusion } from './scatter/exclusionMask'
import { hashSeed, scatter, type ScatterPoint } from './scatter/seededRandom'
import { createSlopeExclusion, type SampleHeight } from './scatter/slopeMask'

const MODEL_URL = '/models/vegetation_kit.glb'
const SPECIES = ['grass', 'flower_yellowA', 'plant_bush'] as const
const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
/** M1-20 — vista 시선 통로에는 산포하지 않는다. */
const VISTA_LINES = vistas.markers.map((m) => ({ position: m.position, target: m.target }))

interface LoadedModel {
  scene: Object3D
}

export interface FoliageProps {
  sampleHeight: SampleHeight
}

function materialColor(material: Material | Material[]): Color {
  const candidate = Array.isArray(material) ? material[0] : material
  if ('color' in candidate && candidate.color instanceof Color) return candidate.color
  return new Color('#3b3e26')
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
    const color = materialColor(mesh.material)
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

function SpeciesInstances({
  name,
  geometry,
  points,
  sampleHeight,
  maxDistance,
}: {
  name: string
  geometry: BufferGeometry
  points: ScatterPoint[]
  sampleHeight: SampleHeight
  /** M1-24 종별 최대 표시 거리(m). 이보다 먼 instance 는 draw 하지 않는다. */
  maxDistance: number
}) {
  const ref = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Transform(), [])
  const lastCamera = useRef(new Vector3(Infinity, Infinity, Infinity))

  /** 지형 높이는 좌표가 안 바뀌므로 한 번만 구한다(매 갱신마다 heightmap 을 다시 타면 스톨이 된다). */
  const placed = useMemo(
    () => points.map((p) => ({ ...p, y: sampleHeight(p.x, p.z) })),
    [points, sampleHeight],
  )

  // M1-24 — 카메라 거리 밖 instance 표시 0.
  // `mesh.count` 를 줄이면 그 뒤 instance 는 아예 제출되지 않는다.
  // 카메라가 2m 이상 움직였을 때만 다시 채운다(매 프레임 수천 회 행렬 쓰기 방지).
  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    if (camera.position.distanceToSquared(lastCamera.current) < 4) return
    lastCamera.current.copy(camera.position)

    let visible = 0
    for (const p of placed) {
      if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > maxDistance) continue
      transform.position.set(p.x, p.y, p.z)
      transform.rotation.set(0, p.rotationY, 0)
      transform.scale.setScalar(p.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(visible, transform.matrix)
      visible += 1
    }
    mesh.count = visible
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  })

  return (
    <instancedMesh ref={ref} name={`foliage-${name}`} args={[geometry, undefined, points.length]}>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </instancedMesh>
  )
}

/** 계획서 §3-2/§3-6: 종별 InstancedMesh 3개, low/base 밀도와 반경 적용. */
export function Foliage({ sampleHeight }: FoliageProps) {
  const { scene } = useGLTF(MODEL_URL) as unknown as LoadedModel
  const preset = useRuntime((state) => state.preset)
  const quality = qualityPresets[preset]

  const geometries = useMemo(
    () => SPECIES.map((species) => geometryForSpecies(scene, species)),
    [scene],
  )
  const pointSets = useMemo(() => {
    const total = quality.grassInstances.count
    const counts = [Math.floor(total * 0.7), Math.floor(total * 0.2)]
    counts.push(total - counts[0] - counts[1])
    const radius = quality.grassInstances.radius
    const pathReject = createPathExclusion(CENTERLINE, 2)
    const slopeReject = createSlopeExclusion(sampleHeight)
    const vistaReject = createVistaExclusion(VISTA_LINES)
    const reject = (x: number, z: number) =>
      Math.hypot(x, z) > radius || pathReject(x, z) || slopeReject(x, z) || vistaReject(x, z)

    return SPECIES.map((species, index) =>
      scatter(hashSeed(`m1-${species}`), {
        count: counts[index],
        halfExtent: radius,
        scaleMin: index === 0 ? 0.75 : 0.85,
        scaleMax: index === 0 ? 1.2 : 1.35,
        reject,
      }),
    )
  }, [quality.grassInstances.count, quality.grassInstances.radius, sampleHeight])

  return (
    <group name="foliage-instances">
      {SPECIES.map((species, index) => (
        <SpeciesInstances
          key={species}
          name={species}
          geometry={geometries[index]}
          points={pointSets[index]}
          sampleHeight={sampleHeight}
          maxDistance={quality.grassInstances.radius}
        />
      ))}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
