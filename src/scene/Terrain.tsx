import { useMemo } from 'react'
import { BufferAttribute, PlaneGeometry } from 'three'
import { useLookdevMaterial } from './Atmosphere'
import { WORLD_SIZE } from './bounds'
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
 */

export const TERRAIN_CHUNKS = 4
export const SEGMENTS_PER_CHUNK = 64
const CHUNK_SIZE = WORLD_SIZE / TERRAIN_CHUNKS

/** 청크 하나의 지오메트리. 정점 y 를 heightmap 으로 밀어올린다. */
function buildChunkGeometry(originX: number, originZ: number): PlaneGeometry {
  const geometry = new PlaneGeometry(
    CHUNK_SIZE,
    CHUNK_SIZE,
    SEGMENTS_PER_CHUNK,
    SEGMENTS_PER_CHUNK,
  )
  // PlaneGeometry 는 XY 평면이다. XZ 로 눕히고 나서 높이를 넣는다.
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position as BufferAttribute
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) + originX
    const z = position.getZ(i) + originZ
    position.setY(i, sampleHeight(x, z))
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** M3-06 (R30-A) — 초원/지형 팔레트(§6-2 #4B4A33). 근경 채도 목표는 화면 측정으로 확정한다. */
export const TERRAIN_COLOR = '#504b2b' // R30-A 실측: #4B4A33(S19%)은 Neutral 톤매퍼에서 화면 S 23% → 30~36 을 위해 S30% 로

export function Terrain() {
  const chunks = useMemo(() => {
    const out: { key: string; geometry: PlaneGeometry; x: number; z: number }[] = []
    const half = (TERRAIN_CHUNKS - 1) / 2
    for (let cz = 0; cz < TERRAIN_CHUNKS; cz++) {
      for (let cx = 0; cx < TERRAIN_CHUNKS; cx++) {
        const x = (cx - half) * CHUNK_SIZE
        const z = (cz - half) * CHUNK_SIZE
        out.push({ key: `${cx}-${cz}`, geometry: buildChunkGeometry(x, z), x, z })
      }
    }
    return out
  }, [])

  // M3-05·M3-06 (R30-A) — 초원 색 + 거리 그레이딩(청크 16개가 재질 1개를 공유 → 프로그램 1개)
  const material = useLookdevMaterial({ color: TERRAIN_COLOR, roughness: 0.95, metalness: 0 })

  return (
    <group name="terrain">
      {chunks.map((c) => (
        <mesh key={c.key} geometry={c.geometry} position={[c.x, 0, c.z]} receiveShadow material={material} />
      ))}
    </group>
  )
}
