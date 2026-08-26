/**
 * M0a-08 첫 씬 — 바닥 · 큐브 · 방향광 1개.
 * 과설계 금지: M0-a 는 큐브+바닥+걷기다. 지형·식생·마을은 M1 이후.
 */

/** 바닥 반경(m). walk-check.mjs 의 샘플러와 같은 값이어야 한다. */
export const GROUND_HALF = 40
export const GROUND_Y = 0

/** 평면 바닥 샘플러 — 컨트롤러의 GroundSampler 계약과 동일 */
export function sampleGround(x: number, z: number): number | null {
  return Math.abs(x) <= GROUND_HALF && Math.abs(z) <= GROUND_HALF ? GROUND_Y : null
}

/** 이동을 눈으로 확인하기 위한 정적 기준물. 평면만 있으면 걷는지 알 수 없다. */
const MARKERS: [number, number, number][] = [
  [0, 1, -12],
  [10, 1.5, -22],
  [-14, 1, -6],
  [6, 1, 8],
]

export function Prototype() {
  return (
    <>
      {/* 광원 1개 + 최소 환경광 */}
      <directionalLight position={[18, 24, 12]} intensity={2.2} castShadow={false} />
      <ambientLight intensity={0.35} />

      {/* 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]}>
        <planeGeometry args={[GROUND_HALF * 2, GROUND_HALF * 2, 1, 1]} />
        <meshStandardMaterial color="#4b4a33" roughness={0.95} metalness={0} />
      </mesh>

      {/* 5m 간격 그리드 — 이동 거리를 눈으로 재는 기준 */}
      <gridHelper args={[GROUND_HALF * 2, (GROUND_HALF * 2) / 5, '#6b6a52', '#3a3a2a']} />

      {/* 기준 큐브 */}
      {MARKERS.map((p, i) => (
        <mesh key={i} position={p}>
          <boxGeometry args={[2, 2, 2]} />
          <meshStandardMaterial color="#7a4a32" roughness={0.8} metalness={0} />
        </mesh>
      ))}
    </>
  )
}
