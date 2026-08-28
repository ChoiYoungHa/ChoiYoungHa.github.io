/**
 * R75-C — 룩 개선 A안 자산 레지스트리 (three 비의존, 순수).
 *
 * 자산 파일 **존재 여부는 빌드 시** `Automation/look-assets.mjs` 가 `public/` 을 스캔해
 * `src/data/look-assets.json` 에 적는다. 런타임은 그 JSON 만 읽고 분기하므로 404 시도가 0 이다.
 * 파일명 계약(정확한 경로)은 `LOOK_ASSET_CONTRACT` 가 단일 원본이다 — 스캐너·컴포넌트·테스트가 전부 이것을 읽는다.
 */

import lookAssetsJson from '../data/look-assets.json' with { type: 'json' }

export type HouseKey = 'house-a' | 'house-b' | 'house-c'

/** 자산 파일명 계약. url 은 배포 루트 기준(public/ 아래). */
export const LOOK_ASSET_CONTRACT = {
  heroTree: {
    /** glTF 2.0 binary · Y-up · 미터 · 원점 = 밑동 중심(y=0). 메시 이름/재질 이름에 leaf|leaves|foliage 가 있으면 잎(알파 컷아웃), 나머지는 줄기·가지. 잎 텍스처 baseColor RGBA(알파 = 컷아웃). 높이는 런타임이 48m 로 정규화한다. */
    glb: '/models/hero_tree.glb',
  },
  village: {
    /** 집 3종. Y-up · 미터 · 원점 = 바닥 중심(y=0). 메시 이름에 cap|roof 가 있으면 인스턴스 색(지붕 3변형)을 곱한다 — 그 부분 텍스처는 밝은 무채색 권장. 재질은 GLB 당 1개(baseColor 텍스처 1장, RGB). */
    houses: {
      'house-a': '/models/house_a.glb',
      'house-b': '/models/house_b.glb',
      'house-c': '/models/house_c.glb',
    } as Record<HouseKey, string>,
  },
  grass: {
    /** 잔디 카드. PNG RGBA(알파 = 컷아웃, alphaTest 0.5) · sRGB · 512² 권장 · 잎이 아래(v=0)에 뿌리, 위(v=1)로 자란다. 정점색(팔레트 #3B3E26)을 곱하므로 밝은 저채도 권장. */
    card: '/textures/grass_card.png',
  },
  terrain: {
    /** 1K PBR. diffuse = sRGB RGB(jpg/png), normal = 선형 OpenGL(+Y) 탄젠트 공간. 타일 반복(seamless). 흙/풀 블렌딩은 길 마스크(중심선 거리)로 한다. */
    grassDiffuse: '/textures/ground_grass_diffuse.jpg',
    grassNormal: '/textures/ground_grass_normal.jpg',
    dirtDiffuse: '/textures/ground_dirt_diffuse.jpg',
    dirtNormal: '/textures/ground_dirt_normal.jpg',
    /** 2026-08-28 — ORM(R=AO,G=roughness,B=metallic, 선형). 둘 다 있을 때만 사용. */
    grassOrm: '/textures/ground_grass_orm.png',
    dirtOrm: '/textures/ground_dirt_orm.png',
  },
} as const

/** `look-assets.json` 의 형태. url 이 있으면 파일이 빌드 시 존재한 것이다. */
export interface LookAssetEntry {
  url: string | null
  bytes: number
}

export interface LookAssetRegistry {
  schemaVersion: number
  generatedFromHead: string
  assets: {
    heroTreeGlb: LookAssetEntry
    houseGlb: Record<HouseKey, LookAssetEntry>
    grassCard: LookAssetEntry
    terrainGrassDiffuse: LookAssetEntry
    terrainGrassNormal: LookAssetEntry
    terrainDirtDiffuse: LookAssetEntry
    terrainDirtNormal: LookAssetEntry
    terrainGrassOrm?: LookAssetEntry
    terrainDirtOrm?: LookAssetEntry
  }
}

export const HOUSE_KEYS: readonly HouseKey[] = ['house-a', 'house-b', 'house-c'] as const

export interface ResolvedLookAssets {
  /** 거대 수목 LOD0: GLB 또는 절차 수목. LOD1 은 항상 절차. */
  heroTree: { mode: 'gltf'; url: string } | { mode: 'procedural' }
  /** 집 종별: GLB 가 있는 종만 GLB(부분 혼합 허용). */
  village: Record<HouseKey, { mode: 'gltf'; url: string } | { mode: 'procedural' }>
  /** grassLite 크로스 쿼드에 알파 카드 텍스처를 입힐지. */
  grass: { mode: 'texture'; url: string } | { mode: 'vertex' }
  /** 지형: diffuse 2장이 모두 있어야 PBR. normal 은 둘 다 있을 때만(하나만 있으면 무시). */
  terrain:
    | { mode: 'pbr'; grassDiffuse: string; dirtDiffuse: string; grassNormal: string | null; dirtNormal: string | null; grassOrm: string | null; dirtOrm: string | null }
    | { mode: 'flat' }
}

const EMPTY: LookAssetEntry = { url: null, bytes: 0 }

/** 스캐너가 만드는 빈 레지스트리(자산 0 → 전부 폴백). */
export function emptyLookAssetRegistry(head = 'unknown'): LookAssetRegistry {
  return {
    schemaVersion: 1,
    generatedFromHead: head,
    assets: {
      heroTreeGlb: { ...EMPTY },
      houseGlb: { 'house-a': { ...EMPTY }, 'house-b': { ...EMPTY }, 'house-c': { ...EMPTY } },
      grassCard: { ...EMPTY },
      terrainGrassDiffuse: { ...EMPTY },
      terrainGrassNormal: { ...EMPTY },
      terrainDirtDiffuse: { ...EMPTY },
      terrainDirtNormal: { ...EMPTY },
      terrainGrassOrm: { ...EMPTY },
      terrainDirtOrm: { ...EMPTY },
    },
  }
}

/**
 * 레지스트리 → 4경로 분기. `forceProcedural` 은 `?lookAssets=0`(A/B 캡처용) — 자산이 있어도 전부 폴백.
 * 부분 존재 규칙: 집은 종별, 지형은 diffuse 쌍 필수·normal 쌍 선택.
 */
export function resolveLookAssets(registry: LookAssetRegistry, forceProcedural = false): ResolvedLookAssets {
  const a = registry.assets
  const present = (e: LookAssetEntry): e is { url: string; bytes: number } => !forceProcedural && typeof e.url === 'string' && e.url.length > 0

  const village = Object.fromEntries(
    HOUSE_KEYS.map((key) => {
      const entry = a.houseGlb[key]
      return [key, present(entry) ? { mode: 'gltf', url: entry.url } : { mode: 'procedural' }]
    }),
  ) as ResolvedLookAssets['village']

  const normals = present(a.terrainGrassNormal) && present(a.terrainDirtNormal)
  const orms = a.terrainGrassOrm !== undefined && a.terrainDirtOrm !== undefined && present(a.terrainGrassOrm) && present(a.terrainDirtOrm)
  const terrain: ResolvedLookAssets['terrain'] =
    present(a.terrainGrassDiffuse) && present(a.terrainDirtDiffuse)
      ? {
          mode: 'pbr',
          grassDiffuse: a.terrainGrassDiffuse.url as string,
          dirtDiffuse: a.terrainDirtDiffuse.url as string,
          grassNormal: normals ? (a.terrainGrassNormal.url as string) : null,
          dirtNormal: normals ? (a.terrainDirtNormal.url as string) : null,
          grassOrm: orms ? (a.terrainGrassOrm?.url as string) : null,
          dirtOrm: orms ? (a.terrainDirtOrm?.url as string) : null,
        }
      : { mode: 'flat' }

  return {
    heroTree: present(a.heroTreeGlb) ? { mode: 'gltf', url: a.heroTreeGlb.url } : { mode: 'procedural' },
    village,
    grass: present(a.grassCard) ? { mode: 'texture', url: a.grassCard.url } : { mode: 'vertex' },
    terrain,
  }
}

/** `?lookAssets=0` 이면 강제 폴백. 그 외(부재 포함)는 레지스트리대로. */
export function readForceProcedural(search: string): boolean {
  return new URLSearchParams(search).get('lookAssets') === '0'
}

/**
 * 잎/줄기 분류 — GLB 메시·재질 이름 기준(계약). R96-A: 이름이 무의미한 자산(BigTree_3Donimus: mat9/mat10/…, 텍스처 없음)을 위해
 * baseColor(선형 RGB) 가 녹색 우세(g > r·g > b)면 잎으로 보는 fallback 을 둔다. 이름 규칙이 먼저다.
 */
export function classifyHeroMesh(meshName: string, materialName: string, baseColor?: { r: number; g: number; b: number }): 'leaf' | 'bark' {
  const s = `${meshName} ${materialName}`.toLowerCase()
  if (/leaf|leaves|foliage|canopy/.test(s)) return 'leaf'
  if (/bark|trunk|branch|root/.test(s)) return 'bark'
  if (baseColor && baseColor.g > baseColor.r && baseColor.g > baseColor.b) return 'leaf'
  return 'bark'
}

/** 갓/지붕(인스턴스 색 적용) vs 본체 분류 — GLB 메시 이름 기준(계약). */
export function classifyHouseMesh(meshName: string): 'cap' | 'body' {
  return /cap|roof/i.test(meshName) ? 'cap' : 'body'
}

/**
 * GLB 수목을 절차 수목 규격(높이 48m, 밑동 y=0)에 맞추는 변환. bbox 는 GLB 원본 단위.
 * scale = 목표 높이 / bbox 높이, offsetY = 밑동을 0 으로 끌어내리는 이동(스케일 적용 후 단위).
 */
export function fitHeroTransform(
  bbox: { minY: number; maxY: number },
  targetHeight: number,
): { scale: number; offsetY: number } {
  const h = bbox.maxY - bbox.minY
  if (!(h > 0) || !Number.isFinite(h)) return { scale: 1, offsetY: 0 }
  const scale = targetHeight / h
  return { scale, offsetY: -bbox.minY * scale }
}

/** 정렬 후 p(0~1) 분위값(선형 보간 없이 하위 index). 빈 배열은 NaN. R100-A 뿌리 기준 y 에 쓴다. */
export function percentileValue(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))
  return sorted[index]
}

/** 지형 길 마스크: 중심선 거리 d 에서 0(풀)~1(흙). 길 폭 안은 1, 폭+feather 밖은 0, 사이는 smoothstep. */
export function pathBlendMask(distanceToCenterline: number, pathWidth: number, feather: number): number {
  const inner = pathWidth / 2
  const outer = inner + Math.max(feather, 1e-6)
  if (distanceToCenterline <= inner) return 1
  if (distanceToCenterline >= outer) return 0
  const t = (outer - distanceToCenterline) / (outer - inner)
  return t * t * (3 - 2 * t)
}

/** 런타임 진입: 빌드 시 생성된 레지스트리 + `?lookAssets=0` 스위치. 컴포넌트는 이것만 부른다. */
export function getLookAssets(search: string = location.search): ResolvedLookAssets {
  return resolveLookAssets(lookAssetsJson as LookAssetRegistry, readForceProcedural(search))
}
