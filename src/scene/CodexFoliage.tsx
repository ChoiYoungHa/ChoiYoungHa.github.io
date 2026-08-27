import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import type { InstancedMesh } from 'three'
import { Object3D as Transform, Vector3 } from 'three'
import mainPath from '../data/main-path.json'
import placement from '../data/placement.json'
import vistas from '../data/vistas.json'
import zones from '../game/data/zones.json'
import { useRuntime } from '../store/useRuntime'
import { WORLD_HALF_EXTENT } from './bounds'
import { createPathExclusion, createVistaExclusion } from './scatter/exclusionMask'
import { hashSeed, scatter, type ScatterPoint } from './scatter/seededRandom'
import { createSlopeExclusion, type SampleHeight } from './scatter/slopeMask'
import { bakeGlb } from './util/bakeGlb'

/**
 * 2026-08-28 (master, 영하님 "세상이 너무 밋밋하다") — 코덱스 시트 E 식생 10종(`게임콘티/assets/3d-codex/foliage`)을
 * 월드에 산포한다. 기존 `Foliage.tsx`(잔디 카드·저채도 정점색)는 그대로 두고 **그 위에** 나무·덤불·꽃·버섯을 얹는다.
 *
 * 규칙:
 *   · 종별 InstancedMesh 1개, 재질은 GLB 것(재질 그룹 유지, `bakeGlb`). 원점 = 바닥 중심.
 *   · 제외: 길(중심선 ±5m)·경사·vista 통로·마을 AABB(큰 종만)·공원 원(큰 종만)·거대 수목 밑동·NPC 주변.
 *   · 거리 컬링은 종별 maxDistance(카메라가 2m 이상 움직였을 때만 재계산 — Foliage.tsx 와 같은 방식).
 *   · 충돌체는 두지 않는다(플레이어는 통과). 필요하면 colliders 에 추가한다.
 */

export interface CodexSpecies {
  id: string
  url: string
  /** base 프리셋 목표 개체 수. low 는 60%. */
  count: number
  scaleMin: number
  scaleMax: number
  maxDistance: number
  /** true 면 마을·공원 안에도 심지 않는다(큰 종). */
  large: boolean
}

export const CODEX_SPECIES: readonly CodexSpecies[] = [
  { id: 'tree-oak-small', url: '/models/foliage/tree-oak-small.glb', count: 70, scaleMin: 0.9, scaleMax: 1.5, maxDistance: 140, large: true },
  { id: 'tree-pine', url: '/models/foliage/tree-pine.glb', count: 60, scaleMin: 0.9, scaleMax: 1.6, maxDistance: 140, large: true },
  { id: 'tree-mushroom-red', url: '/models/foliage/tree-mushroom-red.glb', count: 22, scaleMin: 0.8, scaleMax: 1.3, maxDistance: 140, large: true },
  { id: 'tree-mushroom-org', url: '/models/foliage/tree-mushroom-org.glb', count: 22, scaleMin: 0.8, scaleMax: 1.3, maxDistance: 140, large: true },
  { id: 'bush-round', url: '/models/foliage/bush-round.glb', count: 140, scaleMin: 0.6, scaleMax: 1.2, maxDistance: 80, large: false },
  { id: 'bush-flower', url: '/models/foliage/bush-flower.glb', count: 90, scaleMin: 0.6, scaleMax: 1.1, maxDistance: 80, large: false },
  { id: 'flower-white', url: '/models/foliage/flower-white.glb', count: 260, scaleMin: 0.7, scaleMax: 1.2, maxDistance: 45, large: false },
  { id: 'flower-yellow', url: '/models/foliage/flower-yellow.glb', count: 260, scaleMin: 0.7, scaleMax: 1.2, maxDistance: 45, large: false },
  { id: 'grass-tuft', url: '/models/foliage/grass-tuft.glb', count: 420, scaleMin: 0.6, scaleMax: 1.1, maxDistance: 40, large: false },
  { id: 'mushroom-small', url: '/models/foliage/mushroom-small.glb', count: 140, scaleMin: 0.7, scaleMax: 1.3, maxDistance: 45, large: false },
] as const

const CENTERLINE = mainPath.waypoints.map(({ x, z }) => ({ x, z }))
const VISTA_LINES = vistas.markers.map((m) => ({ position: m.position, target: m.target }))
const PATH_CLEARANCE = 5
const HERO_TREE_CLEARANCE = 14
const NPC_CLEARANCE = 6
const HOUSE_CLEARANCE = 7

interface PlacedPoint extends ScatterPoint { y: number }

type ZoneDef = { shape: 'circle'; center: { x: number; z: number }; radiusMeters: number } | { shape: 'aabb'; min: { x: number; z: number }; max: { x: number; z: number }; marginMeters: number }

function insideZone(zone: ZoneDef, x: number, z: number, pad = 0): boolean {
  if (zone.shape === 'circle') return Math.hypot(x - zone.center.x, z - zone.center.z) <= zone.radiusMeters + pad
  return x >= zone.min.x - pad && x <= zone.max.x + pad && z >= zone.min.z - pad && z <= zone.max.z + pad
}

/** 종별 산포 지점. 순수 함수(seed 고정)라 같은 입력이면 같은 결과다. */
export function placeCodexSpecies(species: CodexSpecies, sampleHeight: SampleHeight, densityScale = 1): PlacedPoint[] {
  const zoneMap = zones.zones as unknown as Record<string, ZoneDef>
  const pathReject = createPathExclusion(CENTERLINE, PATH_CLEARANCE)
  const slopeReject = createSlopeExclusion(sampleHeight)
  const vistaReject = createVistaExclusion(VISTA_LINES)
  const hero = placement.heroTree
  const houses = placement.village as Array<{ position: number[] }>
  const npcs = placement.npcs as Array<{ position: number[] }>
  const reject = (x: number, z: number): boolean => {
    if (pathReject(x, z) || slopeReject(x, z) || vistaReject(x, z)) return true
    if (Math.hypot(x - hero.x, z - hero.z) < HERO_TREE_CLEARANCE) return true
    for (const npc of npcs) if (Math.hypot(x - npc.position[0], z - npc.position[1]) < NPC_CLEARANCE) return true
    for (const house of houses) if (Math.hypot(x - house.position[0], z - house.position[1]) < HOUSE_CLEARANCE) return true
    if (species.large) {
      if (insideZone(zoneMap.village, x, z, 4)) return true
      if (insideZone(zoneMap.park, x, z, 0)) return true
    }
    return false
  }
  return scatter(hashSeed(`codex-${species.id}`), {
    count: Math.max(1, Math.round(species.count * densityScale)),
    halfExtent: WORLD_HALF_EXTENT - 4,
    scaleMin: species.scaleMin,
    scaleMax: species.scaleMax,
    reject,
  }).map((point) => ({ ...point, y: sampleHeight(point.x, point.z) }))
}

function SpeciesInstances({ species, points }: { species: CodexSpecies; points: PlacedPoint[] }) {
  const { scene } = useGLTF(species.url)
  const baked = useMemo(() => bakeGlb(scene), [scene])
  const ref = useRef<InstancedMesh>(null)
  const transform = useMemo(() => new Transform(), [])
  const lastCamera = useRef(new Vector3(Infinity, Infinity, Infinity))

  useLayoutEffect(() => {
    if (ref.current) ref.current.count = 0
    lastCamera.current.set(Infinity, Infinity, Infinity)
  }, [points])

  useFrame(({ camera }) => {
    const mesh = ref.current
    if (!mesh) return
    if (camera.position.distanceToSquared(lastCamera.current) < 4) return
    lastCamera.current.copy(camera.position)
    let visible = 0
    for (const p of points) {
      if (Math.hypot(p.x - camera.position.x, p.z - camera.position.z) > species.maxDistance) continue
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
      name={`codex-foliage-${species.id}`}
      args={[baked.geometry, baked.materials, Math.max(1, points.length)]}
      castShadow={species.large}
      receiveShadow
    />
  )
}

export function CodexFoliage({ sampleHeight }: { sampleHeight: SampleHeight }) {
  const preset = useRuntime((state) => state.preset)
  const densityScale = preset === 'low' ? 0.6 : 1
  const pointSets = useMemo(() => CODEX_SPECIES.map((species) => placeCodexSpecies(species, sampleHeight, densityScale)), [densityScale, sampleHeight])
  return (
    <group name="codex-foliage">
      {CODEX_SPECIES.map((species, index) => <SpeciesInstances key={species.id} species={species} points={pointSets[index]} />)}
    </group>
  )
}

for (const species of CODEX_SPECIES) useGLTF.preload(species.url)
