import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh, Material, Mesh, Object3D, Texture } from 'three'
import { BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, Object3D as Transform, SRGBColorSpace, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import lookdev from '../data/lookdev.json'
import mainPath from '../data/main-path.json'
import vistas from '../data/vistas.json'
import { useRuntime } from '../store/useRuntime'
import { getLookAssets } from '../systems/lookAssets'
import { WORLD_HALF_EXTENT, WORLD_SIZE } from './bounds'
import { isDressingBlocked } from './colliders/dressing'
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
const LOOK = getLookAssets()

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
  grass: '#5d7d33', // 2026-08-28: 코덱스 tile-grass 지면(밝은 황록)에 맞춰 상향 — 이전 #3b3e26 은 새 지면 위에서 검은 조각으로 보였다
  flower_yellowA: '#8a8448',
  plant_bush: '#4f6b2e',
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

/**
 * R91-A(D3) — grass_card.png 는 단일 카드가 아니라 **아틀라스**(Poly Haven 계열, 투명=검정)라 쿼드 전체(0~1)에 매핑하면
 * 검은 조각만 남는다. 아틀라스 하단 중앙 클럼프 영역(u 0.21~0.47, v 0.11~0.25; v=0 이 아래)만 쓴다. 자산이 바뀌면 이 값도 바뀐다.
 */
export const GRASS_CARD_ATLAS_RECT = { u0: 0.21, v0: 0.11, u1: 0.47, v1: 0.25 } as const
/**
 * 2026-08-28 (영하님 "세상이 밋밋") — 지면을 코덱스 시트 F tile-grass(밝은 스타일라이즈드)로 바꾸자 사진 잔디 카드(어두운 실사)가
 * 검은 조각처럼 떠 보였다. 카드 경로를 끄고 정점색 크로스 쿼드(SPECIES_COLOR.grass)로 되돌린다. 카드 자산·코드는 보존(재활성 시 true).
 */
export const GRASS_CARD_ENABLED = true
/** 2026-08-28 (영하님 "저품질 잔디 대체") — grass_card.png 를 코덱스 grass-tuft.glb 를 Blender 로 구운 512² 알파 카드로 교체. 전체 UV(아틀라스 아님)·직사각 쿼드·높이 0.36. */
export const GRASS_CARD_FULL_UV = { u0: 0, v0: 0, u1: 1, v1: 1 } as const
export const GRASS_CARD_QUAD = { taper: 1, height: 0.36 } as const
export const GRASS_CARD_TINT = '#b4dc6e'

function grassLiteGeometry(useAtlasRect = false): BufferGeometry {
  const data = buildGrassLiteGeometry(lookdev.grassLite.seed, useAtlasRect ? GRASS_CARD_QUAD : {})
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(data.normals, 3))
  // 2026-08-28: 그라스라이트 정점색(HSL L18~22 저휘도)을 SPECIES_COLOR.grass 로 덮어 새 지면 톤과 맞춘다.
  const grassColor = new Color(SPECIES_COLOR.grass)
  const colors = new Float32Array(data.colors.length)
  for (let i = 0; i < colors.length; i += 3) { colors[i] = grassColor.r; colors[i + 1] = grassColor.g; colors[i + 2] = grassColor.b }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  // R75-C — 카드 텍스처 UV. 정점색 경로에선 재질이 읽지 않는다.
  const uvs = data.uvs.slice()
  if (useAtlasRect) {
    const r = GRASS_CARD_ENABLED ? GRASS_CARD_FULL_UV : GRASS_CARD_ATLAS_RECT
    for (let i = 0; i < uvs.length; i += 2) {
      uvs[i] = r.u0 + uvs[i] * (r.u1 - r.u0)
      uvs[i + 1] = r.v0 + uvs[i + 1] * (r.v1 - r.v0)
    }
  }
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(new BufferAttribute(data.index, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** R75-C — grassLite 크로스 쿼드에 알파 카드(alphaTest 0.5·blend 없음). 지오메트리가 이미 양면이라 side 는 그대로. */
function GrassCardInstances({ url, ...rest }: { url: string } & Omit<Parameters<typeof SpeciesInstances>[0], 'map'>) {
  const map = useTexture(url, (t) => { (t as Texture).colorSpace = SRGBColorSpace }) as Texture
  return <SpeciesInstances {...rest} map={map} />
}

function SpeciesInstances({
  name,
  geometry,
  points,
  maxDistance,
  maxVisible,
  map,
}: {
  name: string
  geometry: BufferGeometry
  points: PlacedPoint[]
  /** M1-24 종별 최대 표시 거리(m). 이보다 먼 instance 는 draw 하지 않는다. */
  maxDistance: number
  maxVisible: number
  /** R75-C — 알파 카드 텍스처(정점색 × 텍스처). 없으면 현행 정점색. */
  map?: Texture
}) {
  const ref = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Transform(), [])
  const lastCamera = useRef(new Vector3(Infinity, Infinity, Infinity))
  // M3-05 (R30-A) — 거리 그레이딩 재질(종별 1개)
  // 2026-08-28: 코덱스 베이크 카드는 흰 월드광 렌더라 바래 보인다 — 지면(tile-grass) 톤의 황록 틴트를 곱한다.
  const material = useLookdevMaterial({ vertexColors: !map, color: map ? GRASS_CARD_TINT : undefined, roughness: 0.95, metalness: 0, map, alphaTest: map ? 0.5 : undefined }) // R91-A(D3): 카드 텍스처면 정점색(#3B3E26, 선형 0.05) 곱을 빼 이중 어두움 제거

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
      ? grassLiteGeometry(GRASS_CARD_ENABLED && LOOK.grass.mode === 'texture')
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
    // 2026-08-28: 코덱스 광장·데크·텃밭·소품 위(isDressingBlocked)에는 잔디 카드도 심지 않는다.
    const reject = (x: number, z: number) =>
      pathReject(x, z) || slopeReject(x, z) || vistaReject(x, z) || isDressingBlocked(x, z)

    return SPECIES.map((species, index) =>
      scatter(hashSeed(`m1-${species}`), {
        count: counts[index],
        halfExtent: WORLD_HALF_EXTENT,
        // 카드 풀은 0.36m 쿼드라 1.2~1.9 배(≈0.43~0.68m)로 키운다(코덱스 tuft 0.98m 의 절반 안팎).
        scaleMin: index === 0 ? (grassLiteEnabled && GRASS_CARD_ENABLED ? 1.2 : 0.75) : 0.85,
        scaleMax: index === 0 ? (grassLiteEnabled && GRASS_CARD_ENABLED ? 1.9 : 1.2) : 1.35,
        reject,
      }).map((point) => ({ ...point, y: sampleHeight(point.x, point.z) })),
    )
  }, [grassLiteEnabled, lod.grassInstances.count, lod.grassInstances.radius, sampleHeight])

  // This GLB has no lower-detail conifer meshes yet, so retain the existing
  // grass-radius cull and expose the planned conifer bands on the scene node.
  const maxDistance = Math.min(lod.grassInstances.radius, lod.coniferLodDistances[2])

  return (
    <group name="foliage-instances" userData={{ lodDistances: lod.coniferLodDistances }}>
      {SPECIES.map((species, index) => {
        const props = { name: species, geometry: geometries[index], points: pointSets[index], maxDistance, maxVisible: visibleCounts[index] }
        return species === 'grass' && grassLiteEnabled && GRASS_CARD_ENABLED && LOOK.grass.mode === 'texture'
          ? <GrassCardInstances key={species} url={LOOK.grass.url} {...props} />
          : <SpeciesInstances key={species} {...props} />
      })}
    </group>
  )
}

useGLTF.preload(MODEL_URL)
if (GRASS_CARD_ENABLED && LOOK.grass.mode === 'texture') useTexture.preload(LOOK.grass.url)
