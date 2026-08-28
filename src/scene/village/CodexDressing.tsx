import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import { BufferGeometry, Matrix4, Object3D as Transform } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import dressing from '../../data/dressing.json' with { type: 'json' }
import placement from '../../data/placement.json' with { type: 'json' }
import { getSharedVertexColorMaterial } from '../Atmosphere'
import { DRESSING_PROPS } from '../colliders/dressing'
import { sampleHeight } from '../terrain/heightmap'
import { bakeGlbVertexColor } from '../util/bakeGlbVertexColor'

/**
 * 2026-08-28 (룩 심사안 #8, master 직접) — 코덱스 소품 세트(우물·벤치·이정표·상자·통·양동이·건초·화분·등불·수레·모루·보물상자)와
 * 집 처마 덩굴. 전부 정적이라 **정점색 베이크 후 배치 행렬을 적용해 메시 1개로 병합**한다(≈99K tris, draw call 1, 파이프라인 1+그림자).
 * 처음엔 종별 InstancedMesh 14개였는데 WebGPU 파이프라인이 메시 단위로 잡혀 81→107 로 뛰었다(m6-game-dress·dress2 실측) — 병합으로 되돌린다.
 * 좌표 정본은 `src/data/dressing.json`(충돌체는 colliders/dressing.ts 가 같은 파일을 읽는다).
 */

export const DRESSING_URLS: Record<string, string> = {
  well: '/models/props/prop-well.glb',
  bench: '/models/props/prop-bench.glb',
  signpost: '/models/props/prop-signpost.glb',
  crate: '/models/props/prop-crate.glb',
  barrel: '/models/props/prop-barrel.glb',
  bucket: '/models/props/prop-bucket.glb',
  haystack: '/models/props/prop-haystack.glb',
  flowerpot: '/models/props/prop-flowerpot.glb',
  lantern: '/models/props/prop-lantern.glb',
  cart: '/models/props/prop-cart.glb',
  anvil: '/models/props/prop-anvil.glb',
  chest: '/models/loot/itm-box-closed.glb',
}
export const VINE_URL = '/models/foliage/vine-hanging.glb'
export const DRESSING_DESATURATE = 0.3
/** Village.tsx HOUSE_TARGET_HEIGHT_METERS 와 같은 값(집 GLB 정규화 높이). */
const HOUSE_HEIGHT = 6.0
const VILLAGE_CENTER = { x: 0, z: 8 }
const KINDS = Object.keys(DRESSING_URLS)

export interface Placed { x: number; y: number; z: number; yaw: number; scale: number }

/** 집마다 마을 중심을 향한 처마 아래 덩굴 1줄(순수 계산 — 테스트 가능). */
export function vinePlacements(): Placed[] {
  const cfg = dressing.vines
  const eaveRatio = cfg.eaveRatio as Record<string, number>
  const edgeRadius = cfg.edgeRadius as Record<string, number>
  return placement.village.map((house, index) => {
    const [hx, hz] = house.position
    const dx = VILLAGE_CENTER.x - hx
    const dz = VILLAGE_CENTER.z - hz
    const len = Math.hypot(dx, dz) || 1
    const r = (edgeRadius[house.house] ?? 3.2) * house.scale
    const x = hx + (dx / len) * r
    const z = hz + (dz / len) * r
    const eave = HOUSE_HEIGHT * (eaveRatio[house.house] ?? 0.72) * house.scale
    const [s0, s1] = cfg.scale
    return { x, z, y: sampleHeight(hx, hz) + eave - cfg.drop, yaw: Math.atan2(dx, dz), scale: s0 + ((index * 7) % 5) / 5 * (s1 - s0) }
  })
}

/** 소품 배치(dressing.json → 지면 높이 적용). */
export function propPlacements(): Array<{ kind: string } & Placed> {
  return DRESSING_PROPS
    .filter((p) => DRESSING_URLS[p.kind] !== undefined)
    .map((p) => ({ kind: p.kind, x: p.position[0], z: p.position[1], y: sampleHeight(p.position[0], p.position[1]), yaw: p.yaw, scale: p.scale }))
}

function placeAll(source: BufferGeometry, entries: Placed[]): BufferGeometry[] {
  const t = new Transform()
  const m = new Matrix4()
  return entries.map((e) => {
    t.position.set(e.x, e.y, e.z)
    t.rotation.set(0, e.yaw, 0)
    t.scale.setScalar(e.scale)
    t.updateMatrix()
    m.copy(t.matrix)
    return source.clone().applyMatrix4(m)
  })
}

export function CodexDressing() {
  const gltfs = useGLTF(KINDS.map((k) => DRESSING_URLS[k]))
  const vine = useGLTF(VINE_URL)
  const material = getSharedVertexColorMaterial()
  const geometry = useMemo(() => {
    const props = propPlacements()
    const parts: BufferGeometry[] = []
    KINDS.forEach((kind, i) => {
      const entries = props.filter((p) => p.kind === kind)
      if (entries.length === 0) return
      const baked = bakeGlbVertexColor(gltfs[i].scene, { desaturate: DRESSING_DESATURATE })
      parts.push(...placeAll(baked.geometry, entries))
    })
    const vineBaked = bakeGlbVertexColor(vine.scene, { pivot: 'top', desaturate: DRESSING_DESATURATE })
    parts.push(...placeAll(vineBaked.geometry, vinePlacements()))
    const merged = mergeGeometries(parts, false) as BufferGeometry | null
    if (merged === null) throw new Error('CodexDressing: merge failed')
    parts.forEach((p) => p.dispose())
    merged.computeBoundingSphere()
    return merged
  }, [gltfs, vine.scene])
  return <mesh name="codex-dressing" geometry={geometry} material={material} castShadow receiveShadow />
}

for (const url of Object.values(DRESSING_URLS)) useGLTF.preload(url)
useGLTF.preload(VINE_URL)
