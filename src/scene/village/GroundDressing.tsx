import { useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace, type Texture } from 'three'
import { attribute, float, fract, normalMap, positionWorld, texture, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import dressing from '../../data/dressing.json' with { type: 'json' }
import { getActiveTexturePolicy } from '../../gl/createRenderer'
import { useLookdevMaterial } from '../Atmosphere'
import { sampleHeight } from '../terrain/heightmap'

/**
 * 2026-08-28 (룩 심사안 #7, master 직접) — 마을 바닥 드레싱: 광장(돌길)·상점 데크(목재)·텃밭(밭고랑).
 * 코덱스 시트 F 타일 4종을 2048² 2×2 아틀라스(diffuse·normal 2장)에 묶고, 정점 속성 `cell`(0 stone·1 wood·2 soil·3 moss)로 셀을 고른다.
 * 재질 1개·메시 1개(세 지오메트리 병합) → draw call +1, 텍스처 +2.
 * 아틀라스는 `Automation/import-codex-tiles.py`(Blender 헤드리스)가 만든다. 셀 안 반복은 fract(xz/2)*0.5 + offset.
 */
export const TILE_ATLAS_DIFFUSE_URL = '/textures/tiles_atlas_diffuse.jpg'
export const TILE_ATLAS_NORMAL_URL = '/textures/tiles_atlas_normal.jpg'
export const TILE_METERS = 2
/** 셀 가장자리 mip 번짐 회피: 셀 안에서 쓰는 UV 범위를 살짝 안쪽으로(0.5 → 0.49). */
export const CELL_INSET = 0.005

interface Ring { center: [number, number]; radiusX: number; radiusZ: number; rings: number; segments: number; lift: number; cell: number }
interface Deck { center: [number, number]; size: [number, number, number]; yaw: number; lift: number; cell: number }
interface Farm { center: [number, number]; size: [number, number]; segments: [number, number]; lift: number; cell: number }

function withCell(geometry: BufferGeometry, cell: number, edgeDarken?: (i: number) => number): BufferGeometry {
  const count = geometry.attributes.position.count
  geometry.setAttribute('cell', new Float32BufferAttribute(new Float32Array(count).fill(cell), 1))
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) { const k = edgeDarken ? edgeDarken(i) : 1; colors[i * 3] = k; colors[i * 3 + 1] = k; colors[i * 3 + 2] = k }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'cell', 'color'].includes(name)) geometry.deleteAttribute(name)
  return geometry
}

/** 타원 방사 격자(지면 높이 추종). 가장자리 링은 정점색을 어둡게 해 페이드처럼 보이게(블렌딩 금지 규약). */
export function buildPlazaGeometry(p: Ring): BufferGeometry {
  const positions: number[] = []
  const index: number[] = []
  const [cx, cz] = p.center
  for (let r = 0; r <= p.rings; r++) {
    const t = r / p.rings
    for (let s = 0; s < p.segments; s++) {
      const a = (s / p.segments) * Math.PI * 2
      const x = cx + Math.cos(a) * p.radiusX * t
      const z = cz + Math.sin(a) * p.radiusZ * t
      positions.push(x, sampleHeight(x, z) + p.lift, z)
    }
  }
  for (let r = 0; r < p.rings; r++) {
    for (let s = 0; s < p.segments; s++) {
      const a = r * p.segments + s
      const b = r * p.segments + ((s + 1) % p.segments)
      const c = (r + 1) * p.segments + s
      const d = (r + 1) * p.segments + ((s + 1) % p.segments)
      // 각도는 (x,z) 수학 좌표에서 반시계 — Y 위에서 내려다보면 시계가 되므로 텃밭 격자와 반대로 감는다(뒷면 컬링 방지).
      index.push(a, b, c, b, d, c)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  const ringOf = (i: number) => Math.floor(i / p.segments) / p.rings
  return withCell(geometry, p.cell, (i) => 1 - 0.35 * Math.max(0, (ringOf(i) - 0.7) / 0.3))
}

export function buildDeckGeometry(d: Deck): BufferGeometry {
  const [w, h, l] = d.size
  const geometry = new BoxGeometry(w, h, l)
  geometry.rotateY(d.yaw)
  const [cx, cz] = d.center
  geometry.translate(cx, sampleHeight(cx, cz) + d.lift + h / 2, cz)
  return withCell(geometry, d.cell)
}

export function buildFarmGeometry(f: Farm): BufferGeometry {
  const [w, l] = f.size
  const [sx, sz] = f.segments
  const [cx, cz] = f.center
  const positions: number[] = []
  const index: number[] = []
  for (let j = 0; j <= sz; j++) {
    for (let i = 0; i <= sx; i++) {
      const x = cx - w / 2 + (i / sx) * w
      const z = cz - l / 2 + (j / sz) * l
      positions.push(x, sampleHeight(x, z) + f.lift, z)
    }
  }
  for (let j = 0; j < sz; j++) {
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i
      const b = a + 1
      const c = a + sx + 1
      const d = c + 1
      index.push(a, c, b, b, c, d)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(index)
  geometry.computeVertexNormals()
  return withCell(geometry, f.cell)
}

function prepareAtlas(tex: Texture, srgb: boolean): Texture {
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.flipY = false
  if (srgb) tex.colorSpace = SRGBColorSpace
  tex.anisotropy = getActiveTexturePolicy().anisotropy
  tex.needsUpdate = true
  return tex
}

export function GroundDressing() {
  const [diffuse, normal] = useTexture([TILE_ATLAS_DIFFUSE_URL, TILE_ATLAS_NORMAL_URL])
  const geometry = useMemo(() => {
    const g = dressing.ground
    const parts = [buildPlazaGeometry(g.plaza as Ring), buildDeckGeometry(g.deck as Deck), buildFarmGeometry(g.farm as Farm)]
    const merged = mergeGeometries(parts, false) as BufferGeometry | null
    if (merged === null) throw new Error('GroundDressing: merge failed')
    merged.computeBoundingSphere()
    return merged
  }, [])
  const nodes = useMemo(() => {
    const d = prepareAtlas(diffuse, true)
    const n = prepareAtlas(normal, false)
    const cell = attribute('cell', 'float') as unknown as Node<'float'>
    const ox = cell.mod(2).mul(0.5)
    const oy = cell.div(2).floor().mul(0.5)
    const local = fract(positionWorld.xz.mul(1 / TILE_METERS)).mul(0.5 - CELL_INSET * 2).add(CELL_INSET)
    const uv = vec2(local.x.add(ox), local.y.add(oy))
    const shade = attribute('color', 'vec3') as unknown as Node<'vec3'>
    const colorNode = texture(d, uv).rgb.mul(shade) as unknown as Node<'vec3'>
    const normalNode = normalMap(texture(n, uv), vec2(float(0.7))) as unknown as Node<'vec3'>
    return { colorNode, normalNode }
  }, [diffuse, normal])
  const material = useLookdevMaterial({ roughness: 0.85, metalness: 0, colorNode: nodes.colorNode, normalNode: nodes.normalNode })
  return <mesh name="ground-dressing" geometry={geometry} material={material} receiveShadow />
}

useTexture.preload([TILE_ATLAS_DIFFUSE_URL, TILE_ATLAS_NORMAL_URL])
export const GROUND_DRESSING_CELLS = { stone: 0, wood: 1, soil: 2, moss: 3 } as const
