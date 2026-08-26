# M4 final route 재적합 후 브라우저 재실주행 검증 (R73-A)

- 실행: 2026-08-26 밤, main HEAD `d304105`, `npm run build` 1회 → 헤드리스 Chrome `?route=final&q=low` (127.0.0.1:5183, probe-server 기대 2, secure context) → `Docs/qa/m4-final-route-run.json`. R69 결과는 `m4-final-route-run-r69.json`으로 보존.
- 시뮬 예측: `node Automation/fit-final-route.mjs --verify` (dt 1/60, R71-B 재적합) — 최종 편차 0.584m, 밑동 중심거리 3.016m, pass true.

## 판정: **FAIL** (수정은 worker-codex)

| 항목 | 기준 | 실측 | 결과 |
|---|---|---|---|
| routeHash | 파일 = 런타임 = 검증 = `6ad0996f1aff` | 6ad0996f1aff / 6ad0996f1aff / hashMatchesFile true (`test-final-route.mjs` 15/15) | PASS |
| 최종 편차 | ≤ 1.5m | **4.16m** (종료 (38.42, −88.65) vs (36.966, −92.552)) | FAIL |
| 밑동 중심거리 | 3.0~6m | **7.36m** | FAIL |
| hero/village 관통·stuck | 0 | 0 / 0 / 0 (waypoint 11점 기준) | PASS |
| 낙하 | ungroundedFrames 0 | 0 (minY −2.23, 지형 최저) | PASS |
| errors | 0 | errorCount 0 (의도된 rejection 1) · contextLost 0 · tdr 0 | PASS |
| perf(60초 창) | calls ≤200 · programs ≤40 · 1%low ≥20 | avg 136.91 / 1%low 22.65(로드 워밍업 포함) / calls 57 / programs 40 / hitch 0 / tex 34.55MB / heap 81.42MB | PASS(참고) |

## waypoint 편차 — 브라우저 실측 vs 시뮬 예측

| t | waypoint | 목표 (x,z) | 브라우저 (x,z) | 편차 브라우저 | 편차 시뮬 | 브라우저−시뮬 거리 | R69 편차 | 밑동 중심거리 |
|---|---|---|---|---:|---:|---:|---:|---:|
| 0 | spawn | (0, 24) | (-0.02, 23.97) | 0.04 | 0.000 | 0.04 | 0.04 | 125.85 |
| 5 | village-gap | (-5, 10) | (-3.58, 16.34) | 6.50 | 0.833 | 7.11 | 5.51 | 119.79 |
| 10 | village-north | (-9, -6) | (-9.33, 1.54) | 7.55 | 1.420 | 7.11 | 7.50 | 108.42 |
| 17 | meadow-entry | (-6, -28) | (-6.58, -20.39) | 7.63 | 1.707 | 7.12 | 11.26 | 87.77 |
| 24 | gentle-rise | (4, -46) | (5.71, -38.98) | 7.23 | 0.661 | 7.13 | 14.38 | 65.53 |
| 30 | mid-vista | (18, -60) | (19.68, -52.13) | 8.05 | 1.024 | 7.14 | 13.58 | 47.54 |
| 37 | tree-approach | (32, -76) | (32.99, -69.91) | 6.17 | 0.954 | 7.12 | 9.26 | 26.57 |
| 43 | hero-approach | (36.966, -92.552) | (38.41, -88.27) | 4.52 | 0.584 | 5.00 | 9.45 | 7.74 |
| 50 | hero-look | (36.966, -92.552) | (38.42, -88.65) | 4.16 | 0.584 | 4.63 | 9.46 | 7.36 |
| 65 | turn-back | (36.966, -92.552) | (38.42, -88.65) | 4.16 | 0.584 | 4.63 | 9.46 | 7.36 |
| 75 | village-lookback | (36.966, -92.552) | (38.42, -88.65) | 4.16 | 0.584 | 4.63 | 9.46 | 7.36 |

## 원인 분석 (수치 근거)

- 브라우저−시뮬 거리가 t=5~37 내내 **7.11~7.14m로 일정** = 동선 방향은 재적합대로 맞고(R69 14.4m → 최대 8.05m), 경로를 따라 **일정 거리 뒤처져** 있다. 재적합 자체(yaw)는 브라우저에서도 유효.
- `integratedSeconds` 72.755 vs duration 75 → 컨트롤러 적분 시간이 벽시계보다 **2.245s 짧다** × walkSpeed 3.2 = **7.18m** ≈ 관측 지연 7.1m.
- 구조: `finalRouteRunner.ts:50,54` 라우트 시각 = `performance.now()` 벽시계, `Controller.tsx:92` `dt = min(rawDt, 1/20)`. 로드 워밍업(1초차 1.98fps·2초차 10.95fps) 동안 프레임당 최대 0.05s만 적분되어 이동이 손실되고, t=43에 forward=0으로 전환되므로 손실분만큼 목표 앞에서 멈춘다. 시뮬은 dt 1/60 고정이라 이 손실을 모른다.
- 실측 중간 속도: village-gap→village-north 15.88m/5s = 3.18m/s (정상). 손실은 워밍업 구간에만 집중.

## 후보 조치 (worker-codex/master 판단, 본 라운드 미수정)

1. 러너의 라우트 시각을 벽시계 대신 **컨트롤러 적분 시간**(`readIntegratedSeconds`)으로 구동 — 시뮬과 브라우저가 같은 시간축이 되어 예측 0.58m가 그대로 성립할 가능성이 큼. 단 hash·waypoint 시각 불변, bench 경로 비의존 확인 필요.
2. 또는 러너 시작을 loading ready + 안정 프레임(예: 60fps 1초) 뒤로 지연.
3. 또는 시뮬에 워밍업 손실 2.2s를 반영해 재적합(환경 의존이라 비권장).
