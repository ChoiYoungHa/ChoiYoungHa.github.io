# M4 base tris 절감안

- 기준: `Docs/perf/m4-scene-tris.json`의 `grassLiteComparison.base.worstCaseTriangles`
- 예산: worst case `<= 600,000 tris` (`계획서.md` §4-1)
- 산식은 카메라 컬링 전 모든 인스턴스가 보이는 보수적 값이며, hero tree는 LOD0를 사용한다.

## grassLite 적용 base 분해

`base`와 `low`는 모두 `Terrain.tsx`의 `TERRAIN_CHUNKS=4`, `SEGMENTS_PER_CHUNK=64`를 사용한다. 프리셋은 지형 세그먼트 수를 바꾸지 않으므로 지형은 두 프리셋 모두 `4^2 * 64^2 * 2 = 131,072 tris`다.

| 구성 | 산식 | tris | base 704,834 대비 |
|---|---:|---:|---:|
| 지형 | `16 chunks * 64^2 * 2` | 131,072 | 18.5962% |
| 풀 grassLite | `14,000 * 12` | 168,000 | 23.8354% |
| 꽃 GLB | `4,000 * 76` | 304,000 | 43.1319% |
| 관목 GLB | `2,000 * 32` | 64,000 | 9.0802% |
| 바위 GLB | `200 * (16 + 20 + 136)` | 34,400 | 4.8806% |
| 길 | `(240 - 1) * 2` | 478 | 0.0678% |
| 마을 8채 | QA variant 합 | 468 | 0.0664% |
| hero tree LOD0 | 생성기 실측 | 2,416 | 0.3428% |
| **합계** |  | **704,834** | **FAIL, 104,834 초과** |

식생 전체는 `536,000 tris`로 76.0463%다. 그중 풀보다 꽃 `304,000 tris`가 가장 큰 단일 항목이므로 바위만 줄여서는 예산에 도달할 수 없다.

## 절감안 3개

| 안 | 계약 영향 | 계산 | worst 결과 | 판정 |
|---|---|---:|---:|---|
| A. rockLite 8 tris | 풀 20,000·바위 600 계약 유지, 룩 옵션만 추가 | `704,834 - 34,400 + 600*8` | **675,234** | FAIL, 75,234 초과 |
| B. 식생 총량 20,000→15,000 | §3-6 base 프리셋 계약 변경, 영하님 결정 필요 | 70/20/10 분배 시 식생 `402,000`; 기존 바위 유지 | **570,834** | PASS, 29,166 여유 |
| C. 지형 64→28 segments | 지형 해상도 계약·룩 변경 | 지형 `16*28^2*2=25,088` | **598,850** | PASS, 1,150 여유 |

안 A는 코드로 준비했지만 단독 합격안은 아니다. 이론상 바위를 0 tris로 만들어도 `670,434`이므로 부족하다. 안 B에 rockLite를 함께 쓰면 `541,234`, 안 C를 power-of-two 32 segments로 완화하고 rockLite를 함께 쓰면 `576,930`이다(32 segments 단독은 `606,530`, 6,530 초과).

## rockLite 구현 계약

- `src/scene/foliage/rockLiteGeometry.ts`: seed 결정론적 불규칙 팔면체, 8 tris, 밑동 `y=0`, 기본 bounds `height=0.4617m`, `radiusXZ=0.3655m`.
- 기준색은 `#575142`(HSL 44°/14%/30%)이며, 정점색은 hue 40~48°, saturation 11~17%, lightness 26~34%의 저채도 회갈색이다. alpha·alphaTest·blend는 쓰지 않는다.
- `src/data/lookdev.json` 기본값은 `enabled=false`; `?rockLite=1`만 절차적 지오메트리를 선택한다. off일 때 기존 `geometryForSpecies(scene, species)`·산포·거리 컬링·재질 경로는 그대로다.
- on에서도 기존 vertex-color lookdev material을 재사용하므로 새 material·shader variant를 추가하지 않는다.

## 판정과 다음 단계

관문 low는 grassLite+rockLite에서 worst/typical `297,634 / 295,936`으로 PASS다. base는 `675,234 / 673,536`으로 여전히 FAIL이므로 M4-14 완료로 체크할 수 없다. 영하님이 B 또는 C의 계약 변경을 선택한 뒤 GPU 캡처로 밀도·지형 실루엣·바위 형태를 확인하고 최종 합산을 다시 생성해야 한다.
