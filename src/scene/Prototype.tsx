/**
 * 환경광 보험.
 *
 * 이 컴포넌트는 M0-a 의 임시 씬이었다. 들고 있던 것들이 차례로 자기 자리를 찾아갔다:
 *   - 40m 평면 바닥·`sampleGround` → **M1-04** `Terrain.tsx` + `terrain/heightmap.ts`
 *   - 그림자 방향광 → **R18-A** `Lighting.tsx`
 *   - 거리 눈금(gridHelper)·기준 큐브 4개 → **R19-B 제거**
 *
 * 눈금과 큐브는 지형·길이 없던 M0-a 에서 "움직이고 있는가"를 눈으로 확인하려고 둔
 * 디버그 스캐폴딩이다. 지형·하늘·식생·바위가 들어온 지금은 역할이 끝났고,
 * 특히 눈금은 지형 위 6.5m 에 떠 있어 룩을 해쳤다.
 *
 * 남은 것은 환경광 하나뿐이다. 이건 중복이 아니라 **보험**이다 —
 * `SkyDome` 의 HDR 은 비동기 로드이고 실패 경로가 있어서(console.error),
 * 그때 씬이 완전히 어두워지지 않게 한다.
 */
// M3 (R30-A) — HDR 환경광과 이중이라 기본 0. HDR 로드 실패를 재현하려면 `?ambient=0.35`.
// R26-A 실측: 근경 휘도 140(목표 60~75)의 원인 중 하나가 이 0.35 였다(m3-plan.md §1).
export function Prototype() {
  const ambient = Number(new URLSearchParams(location.search).get('ambient'))
  if (!(Number.isFinite(ambient) && ambient > 0)) return null
  return <ambientLight intensity={ambient} />
}
