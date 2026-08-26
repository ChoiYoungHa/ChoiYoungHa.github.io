# S3 하늘 휘도 보정 시도 (R41-A, 2026-08-26)

문제: R30-A 결함 (2) — S3(vista-village) 원경(하늘) 휘도 166 > L3 상단 145. L3 판정은 S1 기준이라 5/5 에는 영향 없지만 S3 가 밝다.

시도 1회(방향 무관 스칼라): `backgroundIntensity` 1.75 → **1.65** (hazeMix 0.4 유지). 3 vista 캡처 + measure.

| 샷 | 원경 S / H / Y | 자동 PASS | 비고 |
|---|---|---|---|
| S1 vista-mid | 11.2 / 212 / 130 | 4/4 | L3 far 130 — 하한 정확히(1.75 에선 134) |
| S2 vista-start | 23.1 / 216 / 98 | 1/4 | L5 20.5 유지 |
| S3 vista-village | 9.7 / 212 / 162 | 3/4 | 162 — 여전히 145 초과 |

**결과: 되돌림(보류).** S3 를 145 아래로 내리려면 bgi ≈1.45 가 필요하고 그때 S1 원경 휘도는 ~120 으로 L3 하한(130) 미달 → S1·S2 PASS 유지와 양립 불가. 원인은 HDR 하늘의 방향별 밝기 차(vista-mid 쪽 하늘이 어둡다)라 스칼라 하나로는 못 잡는다. 해법 후보: `scene.backgroundNode` 에 시선 방위 가중(밝은 쪽 감쇠) — M4 이후.

채택값 불변: bgi 1.75 · hazeMix 0.4 (`src/data/lookdev.json`). 시도 산출: `Docs/lookdev/m3-sweep/m3-s3try-{1,2,3}*`.
