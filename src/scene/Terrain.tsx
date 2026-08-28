import { useTexture } from '@react-three/drei'
import { Suspense, useMemo } from 'react'
import { BufferAttribute, PlaneGeometry, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { attribute, clamp, color, float, luminance, mix, mx_noise_float, normalMap, positionWorld, texture, vec2, vec3 } from 'three/tsl'
import type { MeshStandardNodeMaterial, Node } from 'three/webgpu'
import { useLookdevMaterial } from './Atmosphere'
import { WORLD_SIZE } from './bounds'
import mainPath from '../data/main-path.json' with { type: 'json' }
import { getLookAssets, pathBlendMask } from '../systems/lookAssets'
import { getActiveTexturePolicy } from '../gl/createRenderer'
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
export const TERRAIN_TILE_METERS = 2 // 2026-08-28 심사안 #3: 코덱스 타일 제작 주기(2m)와 일치. 반복은 매크로 스케일·노이즈로 숨긴다.
/** 심사안 #3 — 두 번째 샘플 스케일(m)과 혼합비: 2m 디테일 + 23m 매크로를 섞어 격자 반복을 깬다. */
export const TERRAIN_MACRO_TILE_METERS = 23
export const TERRAIN_MACRO_MIX = 0.35
/** 매크로 명암 변주(mx_noise, 0.035/m) 하한·상한 곱색. */
export const TERRAIN_MACRO_DARK = [0.88, 0.9, 0.84] as const
export const TERRAIN_MACRO_LIGHT = [1.08, 1.05, 0.97] as const
/** 길 경계에 노이즈(0.4/m, ±0.15)를 더해 직선 경계를 흐린다. */
export const TERRAIN_EDGE_NOISE = 0.15
export const TERRAIN_NORMAL_STRENGTH = 0.8
/** ORM: AO 는 70% 만 반영(과한 어둠 방지), roughness 는 0.5 이상으로 클램프. */
export const TERRAIN_AO_MIX = 0.7
/**
 * R91-A(D2) — 텍스처 곱색 = mix(백색, 휘도 정규화 팔레트(TERRAIN_COLOR/자기 휘도), paletteMix) × lumaScale.
 * 텍스처 밝기를 대체로 보존하면서 hue·채도만 팔레트(52°) 쪽으로 조금 옮긴다.
 * 이전(R75-C) TERRAIN_COLOR×2 는 선형 팔레트(0.08,0.07,0.02)×2 를 선형 텍스처(~0.12)에 곱해 근경 휘도 51·hue 355°(자홍, 근흑에서 hue 불안정)를 만들었다.
 * R91-A 실측(S1/S3 근경): 곱색 없음 → 채도 29.9·hue 42.8°·휘도 77.9 / 정규화 팔레트 100% → 43.3·44.6°·79.6. L1~L3 near 범위(채도 30~36·hue 45~55·휘도 60~75).
 * 2차: mix 0.35·luma 0.9 → 채도 34.1~35.7(PASS)·hue 43.3·휘도 76.2. hue 를 45° 위로 올리려 곱색 기준색을 팔레트보다 따뜻한 #5C5A28(hue 57°)로.
 * 3차: #5C5A28·0.35·0.85 → S1/S3 근경 채도 34.6/36.3·hue 44.6/44.9·휘도 75.1/75.4 — 경계 0.4 미달이라 기준색 hue 60°·mix 0.3·luma 0.83 으로 4차.
 */
export const TERRAIN_TEXTURE_TINT = { color: '#5f5f26', paletteMix: 0.1, lumaScale: 0.95 } as const // 2026-08-28: 코덱스 시트 F 타일(tile-grass/dirt-path)로 교체 — 타일 자체 색을 살리려 틴트 약화

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
  // 2026-08-28 심사안 #2: preload 가 renderer.init 이전에 텍스처를 만들어 DEFAULT_ANISOTROPY 가 안 먹었다 — 정책값을 직접 적용.
  tex.anisotropy = getActiveTexturePolicy().anisotropy
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
function TerrainPbr({ urls }: { urls: { grassDiffuse: string; dirtDiffuse: string; grassNormal: string | null; dirtNormal: string | null; grassOrm: string | null; dirtOrm: string | null } }) {
  const diffuse = useTexture([urls.grassDiffuse, urls.dirtDiffuse])
  const normals = useTexture(urls.grassNormal && urls.dirtNormal ? [urls.grassNormal, urls.dirtNormal] : [])
  const orms = useTexture(urls.grassOrm && urls.dirtOrm ? [urls.grassOrm, urls.dirtOrm] : [])
  const nodes = useMemo(() => {
    const [grass, dirt] = diffuse.map((t) => prepareTile(t, true))
    const uvA = worldTileUv()
    const uvB = positionWorld.xz.mul(1 / TERRAIN_MACRO_TILE_METERS)
    const xz = positionWorld.xz
    // 길 마스크에 노이즈를 더해 직선 경계를 흐린다(0~1 클램프).
    const maskRaw = attribute('pathMask', 'float') as unknown as Node<'float'>
    // 노이즈는 경계(0<mask<1)에서만: maskRaw·(1−maskRaw)·4 가 0·1 에서 0 이라 초원 전체에 흙이 새지 않는다(리뷰 2026-08-28).
    const edgeWeight = maskRaw.mul(float(1).sub(maskRaw)).mul(4)
    const mask = clamp(maskRaw.add(mx_noise_float(xz.mul(0.4)).mul(TERRAIN_EDGE_NOISE).mul(edgeWeight)), 0, 1)
    // 2m 디테일 + 23m 매크로 듀얼 스케일
    const grassRgb = mix(texture(grass, uvA).rgb, texture(grass, uvB).rgb, TERRAIN_MACRO_MIX)
    const dirtRgb = mix(texture(dirt, uvA).rgb, texture(dirt, uvB).rgb, TERRAIN_MACRO_MIX)
    const macro = mx_noise_float(xz.mul(0.035)).mul(0.5).add(0.5)
    const macroTint = mix(vec3(...TERRAIN_MACRO_DARK), vec3(...TERRAIN_MACRO_LIGHT), macro)
    const palette = color(TERRAIN_TEXTURE_TINT.color)
    const tint = mix(vec3(1.0), palette.div(luminance(palette)), float(TERRAIN_TEXTURE_TINT.paletteMix)).mul(TERRAIN_TEXTURE_TINT.lumaScale)
    const colorNode = mix(grassRgb, dirtRgb, mask).mul(macroTint).mul(tint) as unknown as Node<'vec3'>
    let normalNode: Node<'vec3'> | undefined
    if (normals.length === 2) {
      const [gN, dN] = normals.map((t) => prepareTile(t, false))
      normalNode = normalMap(mix(texture(gN, uvA), texture(dN, uvA), mask), vec2(float(TERRAIN_NORMAL_STRENGTH))) as unknown as Node<'vec3'>
    }
    let aoNode: Node<'float'> | undefined
    let roughnessNode: Node<'float'> | undefined
    if (orms.length === 2) {
      const [gO, dO] = orms.map((t) => prepareTile(t, false))
      const orm = mix(texture(gO, uvA), texture(dO, uvA), mask)
      aoNode = mix(float(1), orm.r, TERRAIN_AO_MIX) as unknown as Node<'float'>
      roughnessNode = clamp(orm.g, 0.5, 1) as unknown as Node<'float'>
    }
    return { colorNode, normalNode, aoNode, roughnessNode }
  }, [diffuse, normals, orms])
  const material = useLookdevMaterial({ roughness: 0.95, metalness: 0, colorNode: nodes.colorNode, normalNode: nodes.normalNode, aoNode: nodes.aoNode, roughnessNode: nodes.roughnessNode })
  return <TerrainChunks material={material} withPathMask />
}

export function Terrain() {
  if (LOOK.terrain.mode === 'pbr') {
    const { grassDiffuse, dirtDiffuse, grassNormal, dirtNormal, grassOrm, dirtOrm } = LOOK.terrain
    return (
      <Suspense fallback={<TerrainFlat />}>
        <TerrainPbr urls={{ grassDiffuse, dirtDiffuse, grassNormal, dirtNormal, grassOrm, dirtOrm }} />
      </Suspense>
    )
  }
  return <TerrainFlat />
}

if (LOOK.terrain.mode === 'pbr') {
  useTexture.preload([LOOK.terrain.grassDiffuse, LOOK.terrain.dirtDiffuse])
  if (LOOK.terrain.grassNormal && LOOK.terrain.dirtNormal) useTexture.preload([LOOK.terrain.grassNormal, LOOK.terrain.dirtNormal])
  if (LOOK.terrain.grassOrm && LOOK.terrain.dirtOrm) useTexture.preload([LOOK.terrain.grassOrm, LOOK.terrain.dirtOrm])
}
