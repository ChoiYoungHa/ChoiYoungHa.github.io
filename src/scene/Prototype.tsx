import { WORLD_SIZE } from './bounds'
import { sampleHeight } from './terrain/heightmap'

/**
 * 조명과 눈금.
 *
 * M0-a 에서는 여기에 40m 평면 바닥과 `sampleGround` 가 있었다.
 * **M1-04 에서 그 자리를 `Terrain.tsx` + `terrain/heightmap.ts` 가 넘겨받았다** —
 * 바닥은 ±125m 절차적 지형이고 접지 샘플러도 heightmap 이 유일한 출처다.
 * R18-A 에서 그림자 방향광까지 `Lighting.tsx` 로 넘겼다.
 * 여기 남은 것은 환경광 보험 + 거리 눈금 + 기준 큐브(임시 스캐폴딩)뿐이다.
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

export function Prototype() {
  return (
    <>
      {/* R18-A: 그림자 방향광은 `Lighting.tsx` 가 넘겨받았다(중복 제거).
          환경광은 중복이 아니라 남긴다 — SkyDome 의 HDR 이 비동기 로드이고
          실패 경로가 있어(console.error) 그때 씬이 완전히 어두워지지 않게 하는 최소 보험이다. */}
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
