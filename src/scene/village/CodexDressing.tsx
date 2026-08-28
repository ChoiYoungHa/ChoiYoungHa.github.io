import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BufferGeometry, Matrix4, Object3D as Transform } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import dressing from '../../data/dressing.json' with { type: 'json' }
import placement from '../../data/placement.json' with { type: 'json' }
import { getSharedVertexColorMaterial } from '../Atmosphere'
import { DRESSING_PROPS } from '../colliders/dressing'
import { createVillageColliders } from '../colliders/village'
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

/**
 * 집마다 마을 중심을 향한 처마 아래 덩굴 1줄(순수 계산 — 테스트 가능).
 * 리뷰(2026-08-28): 원형 반경은 회전된 집 footprint 밖 공중에 떴다 → 집 충돌 박스(colliders/village.ts, 회전·스케일 적용)의 면과
 * "집 중심→마을 중심" 광선의 교점에 붙인다(면에서 0.12m 바깥).
 */
export function vinePlacements(): Placed[] {
  const cfg = dressing.vines
  const eaveRatio = cfg.eaveRatio as Record<string, number>
  const colliders = createVillageColliders()
  return placement.village.map((house, index) => {
    const [hx, hz] = house.position
    const dx = VILLAGE_CENTER.x - hx
    const dz = VILLAGE_CENTER.z - hz
    const len = Math.hypot(dx, dz) || 1
    const dir = { x: dx / len, z: dz / len }
    // 집의 첫 박스 기준: 로컬 프레임으로 회전해 박스 면까지의 t 를 구한다.
    const box = colliders.find((c) => c.buildingId === house.id)
    let t = 3.2 * house.scale
    if (box !== undefined) {
      const cos = Math.cos(box.rotationY)
      const sin = Math.sin(box.rotationY)
      const lx = dir.x * cos + dir.z * sin
      const lz = -dir.x * sin + dir.z * cos
      const tx = Math.abs(lx) < 1e-6 ? Infinity : box.halfX / Math.abs(lx)
      const tz = Math.abs(lz) < 1e-6 ? Infinity : box.halfZ / Math.abs(lz)
      const ox = box.x - hx
      const oz = box.z - hz
      t = Math.min(tx, tz) + (ox * dir.x + oz * dir.z)
    }
    const x = hx + dir.x * (t + 0.12)
    const z = hz + dir.z * (t + 0.12)
    const eave = HOUSE_HEIGHT * (eaveRatio[house.house] ?? 0.72) * house.scale
    const [s0, s1] = cfg.scale
    return { x, z, y: sampleHeight(hx, hz) + eave - cfg.drop, yaw: Math.atan2(dx, dz), scale: s0 + ((index * 7) % 5) / 5 * (s1 - s0) }
  })
}

/** 마을 밖(원점에서 40m 이상) 소품은 별도 메시로 — 한 메시에 섞으면 바운딩 구가 93m 로 커져 절대 컬링되지 않았다(리뷰). */
export const FAR_PROP_RADIUS = 40

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
  const geometries = useMemo(() => {
    const props = propPlacements()
    const near: BufferGeometry[] = []
    const far: BufferGeometry[] = []
    KINDS.forEach((kind, i) => {
      const entries = props.filter((p) => p.kind === kind)
      if (entries.length === 0) return
      const baked = bakeGlbVertexColor(gltfs[i].scene, { desaturate: DRESSING_DESATURATE })
      near.push(...placeAll(baked.geometry, entries.filter((e) => Math.hypot(e.x, e.z) < FAR_PROP_RADIUS)))
      far.push(...placeAll(baked.geometry, entries.filter((e) => Math.hypot(e.x, e.z) >= FAR_PROP_RADIUS)))
      baked.geometry.dispose()
    })
    const vineBaked = bakeGlbVertexColor(vine.scene, { pivot: 'top', desaturate: DRESSING_DESATURATE })
    near.push(...placeAll(vineBaked.geometry, vinePlacements()))
    vineBaked.geometry.dispose()
    const merge = (parts: BufferGeometry[]): BufferGeometry | null => {
      if (parts.length === 0) return null
      const merged = mergeGeometries(parts, false) as BufferGeometry | null
      parts.forEach((p) => p.dispose())
      if (merged === null) throw new Error('CodexDressing: merge failed')
      merged.computeBoundingSphere()
      return merged
    }
    return { near: merge(near), far: merge(far) }
  }, [gltfs, vine.scene])
  useEffect(() => () => { geometries.near?.dispose(); geometries.far?.dispose() }, [geometries])
  return (
    <group name="codex-dressing-root">
      {geometries.near !== null && <mesh name="codex-dressing" geometry={geometries.near} material={material} castShadow receiveShadow />}
      {geometries.far !== null && <mesh name="codex-dressing-far" geometry={geometries.far} material={material} castShadow receiveShadow />}
    </group>
  )
}

for (const url of Object.values(DRESSING_URLS)) useGLTF.preload(url)
useGLTF.preload(VINE_URL)
