# M4 grassLite 절차적 저폴리 풀 옵션 (R56-B)

## 목적과 스위치

- R53-B 기준 low worst는 816,434 tris로 §4-1 예산 600,000을 216,434 초과했다.
- `src/data/lookdev.json`의 `grassLite.enabled` 기본값은 `false`다.
- 캡처 후보는 `?grassLite=1`, 강제 원복은 `?grassLite=0`이다.
- 풀 개수·반경 계약(low 6,000×25m, base 20,000×40m), 산포 seed, 카메라 거리 컬링은 바꾸지 않는다.

## 지오메트리 계약

`src/scene/foliage/grassLiteGeometry.ts`는 three 비의존 순수 생성기다.

| 항목 | 실측값 |
|---|---:|
| seed | `539363366` (`0x20260826`) |
| 구성 | 테이퍼된 교차 쿼드 3장, 앞/뒤 면 명시 |
| 정점 | 24 |
| index | 36 |
| tris/instance | 12 |
| minY / maxY | 0 / 0.268513m |
| radiusXZ | 0.192057m |
| alpha / alphaTest / blend | 없음 / 0 / false |

Kenney grass의 원본 accessor 범위(높이 0.254m, XZ 반경 약 0.24m)에 맞춰 높이와 폭을 잡고 밑동을 y=0에 고정했다. 정점색은 고정 hue 68°·saturation 24%와 seed별 lightness 18~22%를 sRGB→linear로 변환해 저장한다. 기준색 `#3B3E26`의 색상축을 유지하며 밝은 초록은 만들지 않는다.

## 합산 전후

`node Automation/scene-tris.mjs --preset low --grass-lite --out Docs/perf/m4-scene-tris-grass-lite.json`으로 생성했다. grass 종만 132→12 tris이며 flower(76)·bush(32)는 GLB를 유지한다.

| preset | 시나리오 | 전 | grassLite 후 | 감소 | §4-1 프리셋별 판정 |
|---|---|---:|---:|---:|---|
| low | worst | 816,434 | 312,434 | 504,000 | 600K PASS |
| low | typical(hero LOD1) | 814,736 | 310,736 | 504,000 | 600K PASS |
| base | worst | 2,384,834 | 704,834 | 1,680,000 | 1.1M PASS(395,166 여유) |
| base | typical(hero LOD1) | 2,383,136 | 703,136 | 1,680,000 | 1.1M PASS(396,864 여유) |

low의 식생 합계는 664,800→160,800 tris다. base는 2,216,000→536,000 tris로 줄어 §4-1 원계약 1.1M을 통과한다. 다만 기본값은 off이므로 low 예산 완료에는 GPU 룩 검증 후 grassLite 활성화 결정이 필요하다.

## 기본 off 불변 근거

- `readGrassLiteEnabled()`는 쿼리가 없으면 JSON의 `false`를 반환한다.
- false이면 기존 `SPECIES.map()`에서 세 종 모두 `geometryForSpecies(scene, species)`를 그대로 호출한다.
- true일 때만 `species === 'grass'` 한 곳을 절차적 BufferGeometry로 교체한다. flower·bush, `SpeciesInstances`, InstancedMesh count, 산포, 거리 추종, `useLookdevMaterial({ vertexColors:true })`는 동일하다.
- 두 지오메트리 모두 position·normal·color·index만 사용하고 재질/define/alpha 경로를 바꾸지 않으므로 shader program 변형 증가는 0으로 예상한다. 실제 programs 수는 GPU GATE에서 확인한다.

## 룩 위험

- 실루엣: 덩어리형 Kenney 메시가 세 장의 얇은 팬 형태로 바뀌어 근접 시 평면성이 보일 수 있다.
- 밀도감: instance 수는 같아도 개별 잎의 화면 점유가 줄어 초원이 성기게 느껴질 수 있다.
- 채도/휘도: 팔레트 hue·saturation은 고정했지만 면 방향과 조명 반응이 달라 L1 근경 채도·L3 휘도가 움직일 수 있다.
- 양면은 index와 반대 normal로 만들었고 alpha를 쓰지 않아 오버드로/정렬 문제는 추가하지 않는다.

## GPU GATE 후 확인 절차

1. 동일 HEAD·low·S1/S2/S3에서 기본 URL과 `?grassLite=1`을 캡처하고 L1~L5 자동/수동 판정을 비교한다.
2. Runtime HUD/bench로 programs 증가 0, shader·console error 0, low fps/1% low 회귀 여부를 기록한다.
3. worker-claude 소유 `Automation/lookdev-variants.mjs`에 `{ id: "grassLite", query: "grassLite=1" }` 변형을 추가해 같은 캡처·measure 흐름에 연결한다(현재 wt/loading에는 해당 러너가 없어 이번 작업에서 수정하지 않음).
