# M4 final route 브라우저 실주행 검증 (R74-A, R73-A 이력 포함)

- 실행: 2026-08-26 밤, main HEAD `d8e733f` + `finalRouteRunner.ts` 시간축 수정(미커밋), `npm run build` 1회 → 헤드리스 Chrome `?route=final&q=low` (127.0.0.1:5183, probe-server 기대 2, secure context) → `Docs/qa/m4-final-route-run.json`. 이전 결과는 `m4-final-route-run-r73.json`·`-r69.json`으로 보존.
- 시뮬 예측: `node Automation/fit-final-route.mjs --verify` (dt 1/60, R71-B 재적합, hash `6ad0996f1aff`) — 최종 편차 0.584m, 밑동 3.016m.

## 판정: **PASS**

| 항목 | 기준 | 실측 (R74-A) | R73-A | 결과 |
|---|---|---|---|---|
| routeHash | 파일 = 런타임 = 검증 `6ad0996f1aff` | 일치, hashMatchesFile true, `test-final-route.mjs` 15/15 | 동일 | PASS |
| 최종 편차 | ≤ 1.5m | **0.58m** (종료 (37.14, −93.11) vs (36.966, −92.552)) | 4.16m | PASS |
| 밑동 중심거리 | 3.0~6m | **3.02m** | 7.36m | PASS |
| hero/village 관통·stuck | 0 | 0 / 0 / 0 (waypoint 11점) | 0 | PASS |
| 낙하 | ungroundedFrames 0 | 0 (minY −2.27, 지형 최저) | 0 | PASS |
| errors | 0 | errorCount 0 (의도된 rejection 1) · contextLost 0 · tdr 0 | 동일 | PASS |
| 시간축 | 적분 = duration | integratedSeconds 75.002 / 벽시계 76.948 | 72.755 / 75 | — |
| perf(60초 창) | calls ≤200 · programs ≤40 · 1%low ≥20 | avg 138.14 / 1%low 25.26(워밍업 포함) / calls 57 / programs 40 / hitch 0 / tex 34.55MB / heap 89.37MB | 136.91/22.65/57/40 | PASS(참고) |

## waypoint 편차 — 브라우저 실측 vs 시뮬 예측

| t | waypoint | 목표 (x,z) | 브라우저 (x,z) | 편차 브라우저 | 편차 시뮬 | 브라우저−시뮬 거리 | R73 편차 | 밑동 중심거리 |
|---|---|---|---|---:|---:|---:|---:|---:|
| 0 | spawn | (0, 24) | (0, 23.97) | 0.03 | 0.000 | 0.03 | 0.04 | 125.84 |
| 5 | village-gap | (-5, 10) | (-4.57, 9.27) | 0.85 | 0.833 | 0.03 | 6.50 | 113.55 |
| 10 | village-north | (-9, -6) | (-10.33, -5.53) | 1.41 | 1.420 | 0.03 | 7.55 | 102.57 |
| 17 | meadow-entry | (-6, -28) | (-7.6, -27.46) | 1.69 | 1.707 | 0.03 | 7.63 | 82.32 |
| 24 | gentle-rise | (4, -46) | (4.68, -46.06) | 0.68 | 0.661 | 0.03 | 7.23 | 60.03 |
| 30 | mid-vista | (18, -60) | (18.65, -59.22) | 1.02 | 1.024 | 0.03 | 8.05 | 41.56 |
| 37 | tree-approach | (32, -76) | (31.97, -76.98) | 0.98 | 0.954 | 0.03 | 6.17 | 19.95 |
| 43 | hero-approach | (36.966, -92.552) | (37.14, -93.11) | 0.58 | 0.584 | 0.02 | 4.52 | 3.02 |
| 50 | hero-look | (36.966, -92.552) | (37.14, -93.11) | 0.58 | 0.584 | 0.02 | 4.16 | 3.02 |
| 65 | turn-back | (36.966, -92.552) | (37.14, -93.11) | 0.58 | 0.584 | 0.02 | 4.16 | 3.02 |
| 75 | village-lookback | (36.966, -92.552) | (37.14, -93.11) | 0.58 | 0.584 | 0.02 | 4.16 | 3.02 |

브라우저와 Node 시뮬이 전 waypoint에서 0.02~0.03m 안에서 일치 → 시뮬 재적합(R71-B)이 브라우저에서 그대로 성립. 남은 편차(최대 1.69m meadow-entry)는 시뮬 자체의 적합 잔차(한도 2m).

## 변경 (R74-A, `src/systems/bench/finalRouteRunner.ts`)

- 라우트 시각을 `performance.now()` 벽시계 대신 `readIntegratedSeconds() − secondsAtStart`(컨트롤러가 dt≤1/20 클램프로 실제 적분한 시간)로 구동 — 입력 공급(`setInputSource`)과 waypoint 기록·종료 판정(`tick`) 양쪽. 결과에 `wallClockSeconds` 참고 필드 추가.
- 불변: `final-route.json`·hash·waypoint 시각·`?route=bench` 경로(`benchRoute.ts` 무수정).
- 효과: 워밍업(1초차 2.43fps·2초차 11.93fps)에서 잃던 2.2s가 라우트 시각에도 반영되어 실주행이 벽시계 76.9s로 늘고, 적분 75.0s에서 정확히 종료.

## R73-A 이력 (수정 전)

- 최종 편차 4.16m·밑동 7.36m FAIL. 브라우저−시뮬 거리가 t=5~37 내내 7.11~7.14m 일정 = 경로상 뒤처짐. integratedSeconds 72.755(−2.245s)×3.2m/s=7.18m 일치 → 시간축 불일치로 규명(`m4-final-route-run-r73.json` lagAnalysis).
