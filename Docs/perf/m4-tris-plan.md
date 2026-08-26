# M4 base tris 절감안

> **R62 C안 채택(2026-08-26): 프리셋별 원계약을 복원했다.** `계획서.md §4-1` 원문은 삼각형 예산을 low `≤600K`, base `≤1.1M`으로 분리한다. 따라서 base grassLite+rockLite worst `675,234`는 **PASS**이고, low baseline `816,434`는 **FAIL**이라 grassLite 룩 검증·채택이 필요하다.

- 기준: `Docs/perf/m4-scene-tris.json`의 4변형 × 2프리셋 `variantSummary`
- 예산: worst case low `<= 600,000`, base `<= 1,100,000 tris` (`계획서.md §4-1`)
- 증거 파일: `m4-scene-tris-baseline.json`, `m4-scene-tris-grass-lite.json`, `m4-scene-tris-rock-lite.json`, `m4-scene-tris-combo.json`
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
| **합계** |  | **704,834** | **base 1.1M PASS, 395,166 여유** |

식생 전체는 `536,000 tris`로 76.0463%다. 그중 풀보다 꽃 `304,000 tris`가 가장 큰 단일 항목이다.

## R58 민감도 분석 — 구 단일 600K 검사 기준

아래 표는 원계약 복원 전 base에도 low 600K를 적용했을 때의 역사적 비교다. 현재 base 판정에는 쓰지 않는다.

| 안 | 계약 영향 | 계산 | worst 결과 | 판정 |
|---|---|---:|---:|---|
| R58-A. rockLite 8 tris | 풀 20,000·바위 600 계약 유지, 룩 옵션만 추가 | `704,834 - 34,400 + 600*8` | **675,234** | 구 600K 기준 FAIL |
| R58-B. 식생 총량 20,000→15,000 | §3-6 base 프리셋 계약 변경 | 70/20/10 분배 시 식생 `402,000`; 기존 바위 유지 | **570,834** | 구 600K 기준 PASS |
| R58-C. 지형 64→28 segments | 지형 해상도 계약·룩 변경 | 지형 `16*28^2*2=25,088` | **598,850** | 구 600K 기준 PASS |

이 분석은 600K 단일 한도에서 바위만 줄여도 부족함을 보인 진단 자료다. R62 결정에서는 시각 품질 값을 바꾸지 않고 `계획서.md §4-1`의 base 1.1M을 복원했다.

## rockLite 구현 계약

- `src/scene/foliage/rockLiteGeometry.ts`: seed 결정론적 불규칙 팔면체, 8 tris, 밑동 `y=0`, 기본 bounds `height=0.4617m`, `radiusXZ=0.3655m`.
- 기준색은 `#575142`(HSL 44°/14%/30%)이며, 정점색은 hue 40~48°, saturation 11~17%, lightness 26~34%의 저채도 회갈색이다. alpha·alphaTest·blend는 쓰지 않는다.
- `src/data/lookdev.json` 기본값은 `enabled=false`; `?rockLite=1`만 절차적 지오메트리를 선택한다. off일 때 기존 `geometryForSpecies(scene, species)`·산포·거리 컬링·재질 경로는 그대로다.
- on에서도 기존 vertex-color lookdev material을 재사용하므로 새 material·shader variant를 추가하지 않는다.

## 판정과 다음 단계

관문 low는 baseline `816,434 / 814,736` FAIL, grassLite `312,434 / 310,736` PASS, combo `297,634 / 295,936` PASS다. base는 baseline `2,384,834 / 2,383,136` FAIL이지만 grassLite `704,834 / 703,136`과 combo `675,234 / 673,536`은 1.1M 기준 PASS다. M4-14 완료 전에는 grassLite의 GPU 룩 검증과 실제 활성화 여부를 확정해야 한다.
