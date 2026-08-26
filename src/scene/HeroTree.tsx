import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, type Mesh } from 'three'
import { useLookdevMaterial } from './Atmosphere'
import placement from '../data/placement.json' with { type: 'json' }
import { buildHeroTree, type Lod } from './hero/heroTreeGeometry'
import { sampleHeight } from './terrain/heightmap'

/**
 * M2-08·09 — 거대 수목 런타임.
 *
 * 지오메트리는 `hero/heroTreeGeometry.ts` 가 순수 배열로 만든다(GLB 없음, 절차적 생성).
 * 여기서는 그 배열을 BufferGeometry 로 감싸고 지형 위에 앉히고 LOD 를 고른다.
 *
 * 드로우콜은 **1** 이다 — 한 시점에 LOD 하나만 렌더한다.
 * 정점 색으로 줄기/수관을 구분하므로 재질도 하나다.
 */

const SPEC = placement.heroTree

/** M2-09 거리 임계. 이보다 멀면 LOD1. `placement.json` 이 단일 원본이다. */
export const LOD_SWITCH_DISTANCE = SPEC.lodSwitchDistanceMeters

/** HUD 가 읽어가는 현재 LOD. 매 프레임 바뀔 수 있어 스토어에 넣지 않는다(계획서 §3-3). */
let activeLod: Lod = 0
export function readHeroTreeLod(): Lod {
  return activeLod
}

function toGeometry(lod: Lod): BufferGeometry {
  const build = buildHeroTree(lod)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(build.positions, 3))
  g.setAttribute('normal', new BufferAttribute(build.normals, 3))
  g.setAttribute('color', new BufferAttribute(build.colors, 3))
  g.computeBoundingSphere()
  return g
}

export function HeroTree() {
  const camera = useThree((s) => s.camera)
  const ref = useRef<Mesh>(null)
  const [lod, setLod] = useState<Lod>(0)

  const geometries = useMemo(() => [toGeometry(0), toGeometry(1)] as const, [])
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

  return (
    <mesh
      ref={ref}
      name="hero-tree"
      geometry={geometries[lod]}
      position={[SPEC.x, groundY, SPEC.z]}
      rotation={[0, SPEC.rotationY, 0]}
      scale={SPEC.scale}
      castShadow
      receiveShadow
      material={material}
    />
  )
}
