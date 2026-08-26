import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh, Material, Mesh, Object3D } from 'three'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D as Transform } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import mainPath from '../data/main-path.json'
import qualityPresets from '../data/quality-presets.json'
import { useRuntime } from '../store/useRuntime'
import { createPathExclusion } from './scatter/exclusionMask'
import { hashSeed, scatter, type ScatterPoint } from './scatter/seededRandom'
import { createSlopeExclusion, type SampleHeight } from './scatter/slopeMask'

const MODEL_URL = '/models/vegetation_kit.glb'
const SPECIES = ['grass', 'flower_yellowA', 'plant_bush'] as const
const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))

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
}: {
  name: string
  geometry: BufferGeometry
  points: ScatterPoint[]
  sampleHeight: SampleHeight
}) {
  const ref = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Transform()
    points.forEach((point, index) => {
      transform.position.set(point.x, sampleHeight(point.x, point.z), point.z)
      transform.rotation.set(0, point.rotationY, 0)
      transform.scale.setScalar(point.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [points, sampleHeight])

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
    const reject = (x: number, z: number) =>
      Math.hypot(x, z) > radius || pathReject(x, z) || slopeReject(x, z)

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
        />
      ))}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
