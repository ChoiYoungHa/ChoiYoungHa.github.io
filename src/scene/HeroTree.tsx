import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useMemo, useState } from 'react'
import { Box3, BufferAttribute, BufferGeometry, Color, DoubleSide, type Material, type Mesh, type Object3D, type Texture, Vector3 } from 'three'
import type { MeshStandardNodeMaterial } from 'three/webgpu'
import { createLookdevMaterial, useLookdevMaterial } from './Atmosphere'
import placement from '../data/placement.json' with { type: 'json' }
import lookdev from '../data/lookdev.json' with { type: 'json' }
import { classifyHeroMesh, fitHeroTransform, getLookAssets, percentileValue } from '../systems/lookAssets'
import { buildHeroTree, CANOPY_COLOR, HERO_TREE, heroContrastColors, type HeroContrastConfig, type HeroTreeColors, type Lod } from './hero/heroTreeGeometry'
import { sampleHeight } from './terrain/heightmap'

/**
 * M2-08·09 — 거대 수목 런타임.
 *
 * 지오메트리는 `hero/heroTreeGeometry.ts` 가 순수 배열로 만든다(절차적 생성).
 * 여기서는 그 배열을 BufferGeometry 로 감싸고 지형 위에 앉히고 LOD 를 고른다.
 *
 * R75-C — LOD0 은 `public/models/hero_tree.glb` 가 **빌드 시** 있으면 GLB(잎 alphaTest 0.5·양면·blend 없음),
 * 없으면 절차 수목. LOD1·충돌 proxy(`colliders/heroTree.ts`)·위치·스케일 API 는 그대로다.
 * 존재 판정은 `src/data/look-assets.json`(Automation/look-assets.mjs) — 런타임 404 시도 0.
 */

const SPEC = placement.heroTree
const LOOK = getLookAssets()

/**
 * M2-09 거리 임계. 이보다 멀면 LOD1. `placement.json` 이 단일 원본이다.
 * R100-A: GLB 수목일 때는 LOD1(절차 수목)이 실루엣과 맞지 않고 tris 여유(low ≈390K ≤600K)가 있어 전환 거리를 400m(월드 대각 353m 밖)로 둔다
 * = 항상 GLB. `?lookAssets=0`(절차)에서는 placement 값 그대로.
 */
export const HERO_GLTF_LOD_SWITCH_METERS = 400
export const LOD_SWITCH_DISTANCE = LOOK.heroTree.mode === 'gltf' ? HERO_GLTF_LOD_SWITCH_METERS : SPEC.lodSwitchDistanceMeters
/** R100-A — 뿌리 부유 보정: 원점을 bbox min 이 아니라 정점 y 하위 2% 분위로 잡고(이상치 뿌리 끝 무시) 추가로 0.5m 침하시킨다. */
export const HERO_ROOT_Y_PERCENTILE = 0.02
export const HERO_ROOT_SINK_METERS = 0.5
/** R100-A — 잎 탈채도: 잎 baseColor 를 팔레트 수관색(#3B3E26, §6-2) 쪽으로 이 비율만큼 섞는다(선형 lerp). */
export const HERO_LEAF_DESATURATE = 0.35

/** HUD 가 읽어가는 현재 LOD. 매 프레임 바뀔 수 있어 스토어에 넣지 않는다(계획서 §3-3). */
let activeLod: Lod = 0
export function readHeroTreeLod(): Lod {
  return activeLod
}

function toGeometry(lod: Lod, colors: HeroTreeColors): BufferGeometry {
  const build = buildHeroTree(lod, undefined, colors)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(build.positions, 3))
  g.setAttribute('normal', new BufferAttribute(build.normals, 3))
  g.setAttribute('color', new BufferAttribute(build.colors, 3))
  g.computeBoundingSphere()
  return g
}

/**
 * R54-A — L4 대비 파라미터. 기본은 `lookdev.json.heroContrast`(enabled=false → 현재 색과 비트 동일).
 * `?heroContrast=1` 로 켜고 `?heroTrunk=0.85&heroCanopy=1.05` 로 배율을 덮어쓴다(부재는 lookdev 값, `Number(null)===0` 함정 회피).
 */
export function readHeroContrast(search: string): HeroContrastConfig {
  const base = lookdev.heroContrast
  const q = new URLSearchParams(search)
  const num = (key: string, fallback: number) => {
    const raw = q.get(key)
    const v = raw === null ? NaN : Number(raw)
    return Number.isFinite(v) && v > 0 ? v : fallback
  }
  return {
    enabled: q.get('heroContrast') === '1' ? true : q.get('heroContrast') === '0' ? false : base.enabled,
    trunkLumaScale: num('heroTrunk', base.trunkLumaScale),
    canopyLumaScale: num('heroCanopy', base.canopyLumaScale),
  }
}

interface GltfMeshes {
  /** 원본 GLB 의 mesh 를 잎/줄기로 나눠 재질을 룩디브 재질로 바꾼 사본. */
  meshes: Mesh[]
  scale: number
  offsetY: number
  /** GLB 안 재질 수(원본) → 룩디브 재질 수(교체 후). 보고용. */
  materialCount: { source: number; replaced: number }
}

function mapOf(material: Material | Material[]): Texture | undefined {
  const m = Array.isArray(material) ? material[0] : material
  return (m as { map?: Texture | null }).map ?? undefined
}

/**
 * GLB 씬 → 잎(alphaTest 0.5·양면)·줄기(불투명) 룩디브 재질 2종. 원본 재질은 (분류·텍스처)별로 하나씩만 새로 만들어
 * 재질 수를 GLB 의 재질 수 이하로 묶는다. 스케일은 높이 48m 로 정규화(`fitHeroTransform`).
 */
function prepareHeroGltf(scene: Object3D): GltfMeshes {
  scene.updateMatrixWorld(true)
  const bbox = new Box3().setFromObject(scene)
  // R100-A: 밑동 기준 y = 월드 정점 y 의 하위 2% 분위(뿌리 끝 이상치가 bbox min 을 끌어내려 수목이 떠 보이는 것을 막는다)
  const ys: number[] = []
  const v = new Vector3()
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) ys.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).y)
  })
  const baseY = ys.length > 0 ? percentileValue(ys, HERO_ROOT_Y_PERCENTILE) : bbox.min.y
  const fit = fitHeroTransform({ minY: baseY, maxY: bbox.max.y }, HERO_TREE.height)
  const scale = fit.scale
  const offsetY = fit.offsetY - HERO_ROOT_SINK_METERS

  const cache = new Map<string, MeshStandardNodeMaterial>()
  const sourceMaterials = new Set<string>()
  const meshes: Mesh[] = []
  scene.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    sourceMaterials.add(material.uuid)
    const srcColor = (material as { color?: { r: number; g: number; b: number; getHexString(): string } }).color
    const kind = classifyHeroMesh(mesh.name, material.name, srcColor)
    const map = mapOf(mesh.material)
    // R96-A: 텍스처 없는 GLB(BigTree)는 baseColorFactor 가 색의 전부 — 재질 교체 시 color 로 넘긴다(없으면 백색이 된다).
    const color = map || !srcColor
      ? undefined
      : kind === 'leaf'
        ? `#${new Color(srcColor.r, srcColor.g, srcColor.b).lerp(new Color(CANOPY_COLOR.r, CANOPY_COLOR.g, CANOPY_COLOR.b), HERO_LEAF_DESATURATE).getHexString()}`
        : `#${srcColor.getHexString()}`
    const key = `${kind}:${map?.uuid ?? 'none'}:${color ?? ''}`
    let replaced = cache.get(key)
    if (!replaced) {
      replaced = kind === 'leaf'
        ? createLookdevMaterial({ map, color, alphaTest: map ? 0.5 : undefined, side: DoubleSide, roughness: 0.85, metalness: 0 })
        : createLookdevMaterial({ map, color, roughness: 0.92, metalness: 0 })
      cache.set(key, replaced)
    }
    const clone = mesh.clone()
    clone.material = replaced
    clone.castShadow = true
    clone.receiveShadow = true
    clone.matrixAutoUpdate = false
    clone.matrix.copy(mesh.matrixWorld)
    meshes.push(clone)
  })
  return { meshes, scale, offsetY, materialCount: { source: sourceMaterials.size, replaced: cache.size } }
}

function HeroTreeGltf({ url, groundY }: { url: string; groundY: number }) {
  const { scene } = useGLTF(url) as unknown as { scene: Object3D }
  const prepared = useMemo(() => prepareHeroGltf(scene), [scene])
  return (
    <group
      name="hero-tree"
      position={[SPEC.x, groundY, SPEC.z]}
      rotation={[0, SPEC.rotationY, 0]}
      scale={SPEC.scale}
      userData={{ source: 'gltf', materialCount: prepared.materialCount }}
    >
      <group position={[0, prepared.offsetY, 0]} scale={prepared.scale}>
        {prepared.meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} />)}
      </group>
    </group>
  )
}

function HeroTreeProcedural({ geometry, groundY, material }: { geometry: BufferGeometry; groundY: number; material: MeshStandardNodeMaterial }) {
  return (
    <mesh
      name="hero-tree"
      geometry={geometry}
      position={[SPEC.x, groundY, SPEC.z]}
      rotation={[0, SPEC.rotationY, 0]}
      scale={SPEC.scale}
      castShadow
      receiveShadow
      material={material}
    />
  )
}

export function HeroTree() {
  const camera = useThree((s) => s.camera)
  const [lod, setLod] = useState<Lod>(0)

  const geometries = useMemo(() => {
    const colors = heroContrastColors(readHeroContrast(location.search))
    return [toGeometry(0, colors), toGeometry(1, colors)] as const
  }, [])
  const groundY = useMemo(() => sampleHeight(SPEC.x, SPEC.z), [])

  // M2-09 — 거리로 LOD 를 고른다. 임계 근처에서 왕복하지 않게 10% 히스테리시스를 둔다.
  useFrame(() => {
    const d = Math.hypot(camera.position.x - SPEC.x, camera.position.z - SPEC.z)
    const next: Lod = lod === 0 ? (d > LOD_SWITCH_DISTANCE * 1.1 ? 1 : 0) : d < LOD_SWITCH_DISTANCE ? 0 : 1
    if (next !== lod) {
      setLod(next)
      activeLod = next
    }
  })

  // 정점 색 하나로 줄기(#5A4632)와 수관(#3B3E26)을 모두 칠한다 — 재질 1개. M3-05·M3-08 (R30-A): 거리 그레이딩 재질
  const material = useLookdevMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 })
  const procedural = <HeroTreeProcedural geometry={geometries[lod]} groundY={groundY} material={material} />

  // R75-C — LOD0 만 GLB. 로딩 중(Suspense)과 LOD1 은 절차 수목이라 씬에 수목이 비는 순간이 없다.
  if (lod === 0 && LOOK.heroTree.mode === 'gltf') {
    return (
      <Suspense fallback={procedural}>
        <HeroTreeGltf url={LOOK.heroTree.url} groundY={groundY} />
      </Suspense>
    )
  }
  return procedural
}

if (LOOK.heroTree.mode === 'gltf') useGLTF.preload(LOOK.heroTree.url)
