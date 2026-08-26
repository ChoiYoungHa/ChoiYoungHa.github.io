import { useTexture } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import { BufferAttribute, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { attribute, color, float, mix, normalMap, positionWorld, texture, vec2 } from 'three/tsl'
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu'
import { useLookdevMaterial } from './Atmosphere'
import { WORLD_SIZE } from './bounds'
import mainPath from '../data/main-path.json' with { type: 'json' }
import { getLookAssets, pathBlendMask } from '../systems/lookAssets'
import { distanceToCenterline, type PathPoint } from './scatter/exclusionMask'
import { sampleHeight } from './terrain/heightmap'

/**
 * M1-04 — 250m 지형 메시.
 *
 * 계획서.md §3-2 의 지형 규격을 그대로 따른다: **4×4 청크 × 청크당 64×64 세그먼트**.
 * 총 4×4×64×64×2 = **131,072 tris**, 드로우콜 16 (§4-1 예산: tris ≤600K, calls ≤200).
 * 격자 간격은 250/256 ≈ 0.977m.
 *
 * 청크로 쪼개는 이유는 §3-2 에 적힌 대로 **청크 단위 프러스텀 컬링**이다.
 * 한 장짜리 메시면 화면 밖 지형까지 매 프레임 그린다.
 *
 * 높이는 `terrain/heightmap.ts` 가 유일한 출처다 —
 * 플레이어 접지(M1-07)와 길(M1-06)이 같은 함수를 쓰므로 서로 어긋날 수 없다.
 *
 * R75-C — `public/textures/ground_{grass,dirt}_{diffuse,normal}.jpg` 가 빌드 시 있으면 길 마스크(정점 속성
 * `pathMask`, 중심선 거리)로 풀/흙을 **재질 1개 안에서 TSL 로 블렌딩**한다. 없으면 현행 단색.
 */

export const TERRAIN_CHUNKS = 4
export const SEGMENTS_PER_CHUNK = 64
const CHUNK_SIZE = WORLD_SIZE / TERRAIN_CHUNKS
const LOOK = getLookAssets()
const CENTERLINE: PathPoint[] = mainPath.waypoints.map((w) => ({ x: w.x, z: w.z }))
/** 길 폭 밖으로 흙이 번지는 거리(m). 길 strip(3m)은 MainPath 가 그리고, 이 마스크는 그 가장자리를 지형에 녹인다. */
export const PATH_BLEND_FEATHER = 2.5
/** PBR 타일 크기(m). 1K 텍스처가 4m 마다 반복 — 근경(2~6m)에서 픽셀이 뭉개지지 않는 최소. */
export const TERRAIN_TILE_METERS = 4
/**
 * 텍스처 곱색. 사진 텍스처(평균 밝기 ~0.5)를 팔레트 #504B2B 근처로 끌어오는 값 — 화면 측정(L1·L5)으로 튜닝한다.
 * 곱색 = TERRAIN_COLOR × 2 (텍스처 중간 회색 0.5 에서 현행 단색과 같은 밝기).
 */
export const TERRAIN_TEXTURE_TINT_SCALE = 2.0

/** 청크 하나의 지오메트리. 정점 y 를 heightmap 으로 밀어올리고 길 마스크를 정점 속성으로 넣는다. */
function buildChunkGeometry(originX: number, originZ: number, withPathMask: boolean): PlaneGeometry {
  const geometry = new PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    SEGMENTS_PER_CHUNK,
    SEGMENTS_PER_CHUNK,
  )
  // PlaneGeometry 는 XY 평면이다. XZ 로 눕히고 나서 높이를 넣는다.
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position as BufferAttribute
  const mask = withPathMask ? new Float32Array(position.count) : null
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + originX
    const z = position.getZ(i) + originZ
    position.setY(i, sampleHeight(x, z))
    if (mask) mask[i] = pathBlendMask(distanceToCenterline(x, z, CENTERLINE), mainPath.widthMeters, PATH_BLEND_FEATHER)
  }
  position.needsUpdate = true
  if (mask) geometry.setAttribute('pathMask', new BufferAttribute(mask, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** M3-06 (R30-A) — 초원/지형 팔레트(§6-2 #4B4A33). 근경 채도 목표는 화면 측정으로 확정한다. */
export const TERRAIN_COLOR = '#504b2b' // R30-A 실측: #4B4A33(S19%)은 Neutral 톤매퍼에서 화면 S 23% → 30~36 을 위해 S30% 로

function useChunks(withPathMask: boolean) {
  return useMemo(() => {
    const out: { key: string; geometry: PlaneGeometry; x: number; z: number }[] = []
    const half = (TERRAIN_CHUNKS - 1) / 2
    for (let cz = 0; cz < TERRAIN_CHUNKS; cz++) {
      for (let cx = 0; cx < TERRAIN_CHUNKS; cx++) {
        const x = (cx - half) * CHUNK_SIZE
        const z = (cz - half) * CHUNK_SIZE
        out.push({ key: `${cx}-${cz}`, geometry: buildChunkGeometry(x, z, withPathMask), x, z })
      }
    }
    return out
  }, [withPathMask])
}

function TerrainChunks({ material, withPathMask }: { material: MeshStandardNodeMaterial; withPathMask: boolean }) {
  const chunks = useChunks(withPathMask)
  return (
    <group name="terrain" userData={{ source: withPathMask ? 'pbr' : 'flat' }}>
      {chunks.map((c) => (
        <mesh key={c.key} geometry={c.geometry} position={[c.x, 0, c.z]} receiveShadow material={material} />
      ))}
    </group>
  )
}

/** 현행 — 단색 + 거리 그레이딩(청크 16개가 재질 1개를 공유 → 프로그램 1개). */
function TerrainFlat() {
  const material = useLookdevMaterial({ color: TERRAIN_COLOR, roughness: 0.95, metalness: 0 })
  return <TerrainChunks material={material} withPathMask={false} />
}

function prepareTile(tex: Texture, srgb: boolean): Texture {
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

/** 월드 XZ 기반 타일 UV — 청크 경계에서 이어지고 정점 uv 를 쓰지 않는다. */
function worldTileUv(): Node<'vec2'> {
  return positionWorld.xz.mul(1 / TERRAIN_TILE_METERS)
}

/**
 * 풀/흙 diffuse(+normal) 블렌딩 노드. 재질은 여전히 1개(colorNode·normalNode 만 교체) — 재질 추가 0.
 * 순서: mask 0 = 풀, 1 = 흙. 곱색은 `TERRAIN_COLOR × TERRAIN_TEXTURE_TINT_SCALE`.
 */
function TerrainPbr({ urls }: { urls: { grassDiffuse: string; dirtDiffuse: string; grassNormal: string | null; dirtNormal: string | null } }) {
  const diffuse = useTexture([urls.grassDiffuse, urls.dirtDiffuse])
  const normals = useTexture(urls.grassNormal && urls.dirtNormal ? [urls.grassNormal, urls.dirtNormal] : [])
  const nodes = useMemo(() => {
    const [grass, dirt] = diffuse.map((t) => prepareTile(t, true))
    const uv = worldTileUv()
    const mask = attribute('pathMask', 'float') as unknown as Node<'float'>
    const tint = color(TERRAIN_COLOR).mul(TERRAIN_TEXTURE_TINT_SCALE)
    const colorNode = mix(texture(grass, uv).rgb, texture(dirt, uv).rgb, mask).mul(tint) as unknown as Node<'vec3'>
    let normalNode: Node<'vec3'> | undefined
    if (normals.length === 2) {
      const [gN, dN] = normals.map((t) => prepareTile(t, false))
      normalNode = normalMap(mix(texture(gN, uv), texture(dN, uv), mask), vec2(float(0.6))) as unknown as Node<'vec3'>
    }
    return { colorNode, normalNode }
  }, [diffuse, normals])
  const material = useLookdevMaterial({ roughness: 0.95, metalness: 0, colorNode: nodes.colorNode, normalNode: nodes.normalNode })
  return <TerrainChunks material={material} withPathMask />
}

export function Terrain() {
  if (LOOK.terrain.mode === 'pbr') {
    const { grassDiffuse, dirtDiffuse, grassNormal, dirtNormal } = LOOK.terrain
    return (
      <Suspense fallback={<TerrainFlat />}>
        <TerrainPbr urls={{ grassDiffuse, dirtDiffuse, grassNormal, dirtNormal }} />
      </Suspense>
    )
  }
  return <TerrainFlat />
}

if (LOOK.terrain.mode === 'pbr') {
  useTexture.preload([LOOK.terrain.grassDiffuse, LOOK.terrain.dirtDiffuse])
  if (LOOK.terrain.grassNormal && LOOK.terrain.dirtNormal) useTexture.preload([LOOK.terrain.grassNormal, LOOK.terrain.dirtNormal])
}
