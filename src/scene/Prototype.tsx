import { WORLD_SIZE } from './bounds'
import { sampleHeight } from './terrain/heightmap'

/**
 * 조명과 눈금.
 *
 * M0-a 에서는 여기에 40m 평면 바닥과 `sampleGround` 가 있었다.
 * **M1-04 에서 그 자리를 `Terrain.tsx` + `terrain/heightmap.ts` 가 넘겨받았다** —
 * 바닥은 ±125m 절차적 지형이고 접지 샘플러도 heightmap 이 유일한 출처다.
 * 여기 남은 것은 광원 1개 + 환경광 + 눈금뿐이다(계획서 §3-2 SkyDome·Atmosphere 는 M3).
 */

/** 그리드 한 칸 10m — 250m 월드에서 5m 눈금은 너무 촘촘하다. */
const GRID_STEP = 10

/** 눈으로 스케일을 재는 기준물. 지형 위에 앉힌다. */
const MARKERS: { x: number; z: number }[] = [
  { x: 0, z: -12 },
  { x: 10, z: -22 },
  { x: -14, z: -6 },
  { x: 6, z: 8 },
]

export function Prototype({ shadowMapResolution }: { shadowMapResolution: number }) {
  return (
    <>
      {/* 광원 1개 + 최소 환경광. 그림자 캐스터는 이것 하나뿐(계획서 §4-1) */}
      <directionalLight
        position={[18, 24, 12]}
        intensity={2.2}
        castShadow
        shadow-mapSize-width={shadowMapResolution}
        shadow-mapSize-height={shadowMapResolution}
      />
      <ambientLight intensity={0.35} />

      {/* 거리 눈금 — 지형 기복 위로 살짝 띄운다 */}
      <gridHelper
        args={[WORLD_SIZE, WORLD_SIZE / GRID_STEP, '#6b6a52', '#3a3a2a']}
        position={[0, 6.5, 0]}
      />

      {/* 기준 큐브 — 지형 높이에 앉힌다(M0-a 에서는 평면이라 y 가 상수였다) */}
      {MARKERS.map((m, i) => (
        <mesh key={i} position={[m.x, sampleHeight(m.x, m.z) + 1, m.z]} castShadow>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="#7a4a32" roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </>
  )
}
