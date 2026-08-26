import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { InstancedMesh, Material, Mesh, Object3D } from 'three'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D as Transform, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import mainPath from '../data/main-path.json'
import vistas from '../data/vistas.json'
import { useRuntime } from '../store/useRuntime'
import { WORLD_HALF_EXTENT } from './bounds'
import { createPathExclusion, createVistaExclusion } from './scatter/exclusionMask'
import { useLookdevMaterial } from './Atmosphere'
import { lodConfigForPreset } from './foliage/lodConfig'
import { hashSeed, scatter, type ScatterPoint } from './scatter/seededRandom'
import { createSlopeExclusion, type SampleHeight } from './scatter/slopeMask'

const MODEL_URL = '/models/props_rocks.glb'
const SPECIES = ['rock_smallA', 'rock_smallFlatA', 'rock_tallA'] as const
const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
/** M1-20 — vista 시선 통로에는 산포하지 않는다. */
const VISTA_LINES = vistas.markers.map((m) => ({ position: m.position, target: m.target }))

interface LoadedModel {
  scene: Object3D
}

export interface RockInstancesProps {
  sampleHeight: SampleHeight
}

// M3-06 (R30-A) — 바위도 GLB 재질 색 대신 팔레트(저채도 회갈색)로 고정한다.
function materialColor(_material: Material | Material[]): Color {
  return new Color('#5b5845')
}

function geometryForSpecies(scene: Object3D, species: string): BufferGeometry {
  scene.updateMatrixWorld(true)
  const root = scene.getObjectByName(species)
  if (!root) throw new Error(`Missing rock species in ${MODEL_URL}: ${species}`)

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
  if (!merged) throw new Error(`Could not merge rock geometry: ${species}`)
  merged.computeBoundingSphere()
  return merged
}

function RockSpecies({
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
  // M3-05 (R30-A) — 거리 그레이딩 재질(종별 1개)
  const material = useLookdevMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })

  /** 지형 높이는 좌표가 안 바뀌므로 한 번만 구한다. */
  const placed = useMemo(
    () => points.map((p) => ({ ...p, y: sampleHeight(p.x, p.z) })),
    [points, sampleHeight],
  )

  // M1-24 — 카메라 거리 밖 instance 표시 0. `mesh.count` 로 제출 자체를 끊는다.
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
    <instancedMesh
      ref={ref}
      name={`rock-${name}`}
      args={[geometry, material, points.length]}
      castShadow
      receiveShadow
    />
  )
}

/** 계획서 §3-2/§3-6: 바위 3종을 종별 한 draw call로 산포한다. */
export function RockInstances({ sampleHeight }: RockInstancesProps) {
  const { scene } = useGLTF(MODEL_URL) as unknown as LoadedModel
  const preset = useRuntime((state) => state.preset)
  const lod = lodConfigForPreset(preset)
  const total = lod.rockInstances

  const geometries = useMemo(
    () => SPECIES.map((species) => geometryForSpecies(scene, species)),
    [scene],
  )
  const pointSets = useMemo(() => {
    const counts = [Math.floor(total / 3), Math.floor(total / 3)]
    counts.push(total - counts[0] - counts[1])
    const pathReject = createPathExclusion(CENTERLINE, 2)
    const slopeReject = createSlopeExclusion(sampleHeight)
    const vistaReject = createVistaExclusion(VISTA_LINES)
    const reject = (x: number, z: number) =>
      pathReject(x, z) || slopeReject(x, z) || vistaReject(x, z)

    return SPECIES.map((species, index) =>
      scatter(hashSeed(`m1-${species}`), {
        count: counts[index],
        halfExtent: WORLD_HALF_EXTENT,
        scaleMin: 0.7,
        scaleMax: 1.35,
        reject,
      }),
    )
  }, [sampleHeight, total])

  return (
    <group name="rock-instances" userData={{ lodDistances: lod.rockLodDistances }}>
      {SPECIES.map((species, index) => (
        <RockSpecies
          key={species}
          name={species}
          geometry={geometries[index]}
          points={pointSets[index]}
          sampleHeight={sampleHeight}
          maxDistance={lod.rockLodDistances[2]}
        />
      ))}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
