# M3 성능·룩 게이트 초안

측정일은 2026-08-26이며, HEAD/build hash `87ee4d6`, actual build, 1280×720 `low`, `?route=bench` 60초 동선, 30초 워밍업 조건이다. build mode는 `first-run-build-once+reuse-dist`이고 WebGPU·WebGL2 각 3회의 routeHash는 모두 `m0b-bench-v3-mainpath`로 동일하다. 이 문서는 master 판정 전 초안이므로 M3-GATE 체크박스를 변경하지 않는다.

## 3회 중앙값

| 경로 | backend | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs | texture GPU MB | JS heap peak MB | process RAM GB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 기본 | WebGPU | 140.58 | 37.14 | 0 | 57 | 40 | 34.55 | 172.04 | 확인 불가 |
| 강제 폴백 | WebGL2 | 140.69 | 38.27 | 0 | 57 | 40 | 34.55 | 196.09 | 확인 불가 |

ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

## 5지표 판정 초안

| 지표 | 기준 | 실측 | 초안 판정 |
|---|---:|---:|---|
| 평균 fps | ≥30 | WebGPU 140.58 / WebGL2 140.69 | PASS |
| 하위 1% fps | ≥20 | WebGPU 37.14 / WebGL2 38.27 | PASS |
| 15분 무크래시 | elapsed≥900s, crash/TDR/context-lost/errors=0 | 914.66s, 14 cycles, 모두 0 | PASS |
| 프로세스 RAM | ≤24GB | 확인 불가 — 영하님 수동 측정 대기 | **판정 보류(PASS 아님)** |
| 1초 끊김 | ≤2 | WebGPU 0 / WebGL2 0 | PASS |

## 룩 추가 조건

최종 build에서 `vista-start=S2`, `vista-mid=S1`, `vista-village=S3`를 `m3-gate-1/2/3.png`로 새로 캡처하고 `measure.mjs`를 재실행했다.

| 명제 | 기준 | gate 실측 | 기존 결정 대비 | 초안 판정 |
|---|---|---|---|---|
| L1 깊이별 채도 | S1 near 30~36 / far 8~12 | 32.4 / 11.4 | 값 차이 0 | PASS |
| L2 온난→한랭 hue | S1 near 45~55 / far 205~215 | 49.7 / 212.2 | 값 차이 0 | PASS |
| L3 원경이 밝음 | S1 near 60~75 / far 130~145 | 67.3 / 134.1 | 값 차이 0 | PASS |
| L4 실루엣 | 수동 근거 | 기존 `Docs/qa/m3-l4-s3.json`, PASS | 자동 재판정 대상 아님 | PASS(수동) |
| L5 전역 채도 | S2 ≤22 | 20.5 | 값 차이 0 | PASS |

지정 조합은 L1~L5 **5/5 PASS**로 기준 `≥4/5`를 충족한다. 파일 순서의 자동 pass 수는 gate-1 `1/4`, gate-2 `4/4`, gate-3 `3/4`로 기존 after와 같고 모든 근/원경·L5 값의 차이는 0이다. gate-2 PNG hash는 기존 after-2와 같으며 gate-1·3은 hash가 달라도 측정값과 판정은 동일하다. 첫 gate-3 전흑 캡처는 실패로 제외하고 정상 HDR 재캡처를 채택했다.

## M2 대비 프레임타임 델타

| backend | 평균 악화율 | 하위 1% 환산 악화율 | 해석 |
|---|---:|---:|---|
| WebGPU | -10.93% | -10.31% | M2 대비 개선 |
| WebGL2 | -0.23% | -6.17% | M2 대비 개선 |

공식과 입력 ms 값은 `Docs/perf/m3-delta.md`에 기록했다. 이 델타는 진단 정보이며 새 합격선이 아니다.

## 3회 편차

| backend | 평균 fps 범위(폭) | 하위 1% fps 범위(폭) | hitch 범위 | calls 범위 | programs 범위 | texture MB 범위 | JS heap peak 범위 |
|---|---:|---:|---:|---:|---:|---:|---:|
| WebGPU | 140.54~141.21 (0.67) | 36.57~40.87 (4.30) | 0~0 | 57~59 | 40~40 | 24.52~34.55 | 134.38~254.76 |
| WebGL2 | 137.44~140.97 (3.53) | 23.33~40.26 (16.93) | 0~1 | 57~57 | 40~40 | 34.55~34.55 | 131.63~215.55 |

WebGL2 run 1의 하위 1%는 23.33, hitch는 1로 가장 큰 편차였지만 두 값 모두 관문을 통과했고 3회 중앙값은 38.27/0이다. 사전 단발 1% low 19.9는 이번 동일 조건 세 run에서 재현되지 않았다.

## 예산·M3-15·이상

- calls 중앙값 57은 low 예산 `≤200`, texture GPU 34.55MB는 `≤300MB`, JS heap 중앙값은 두 경로 모두 `≤900MB` 이내다.
- programs는 모든 run에서 **40/40**으로 PASS지만 여유 0이다.
- M3-15 대상 GTAO·bloom·LUT는 런타임 구현과 EffectComposer 연결이 0건이고 low preset에도 없어 on/off 측정 대상이 없다. `Docs/perf/m3-effects.csv`에 `NOT_MEASURED`로 기록했고 M3-15는 미체크다.
- production build는 exit 0이지만 Vite native config loader의 `__dirname` 호환 경고와 500kB 초과 chunk 경고가 남았다.
- Chrome stderr의 Google GCM `DEPRECATED_ENDPOINT`는 앱 page error와 분리했으며 bench report errors는 0이다.

## 초안 결론

자동 측정 가능한 공통 5지표 중 4개와 룩 5/5는 PASS다. 프로세스 총 RAM이 확인 불가이므로 전체 M3-GATE는 **판정 보류(PASS 아님)**이며, 최종 판정과 후퇴 여부는 master가 결정한다. M3-20은 독립 완료 조건을 충족해 체크 가능하다.

근거 파일: `Docs/perf/m3-runs.csv`, `Docs/perf/m3-webgl-runs.csv`, `Docs/perf/m3-delta.md`, `Docs/qa/m3-smoke.md`, `Docs/qa/m3-15min.md`, `Docs/lookdev/m3-gate-1-metrics.json`, `Docs/lookdev/m3-gate-2-metrics.json`, `Docs/lookdev/m3-gate-3-metrics.json`, `Docs/lookdev/l1-l5-decision.json`, `Docs/perf/m3-effects.csv`, 비교 기준 `Docs/perf/m2-runs.csv`, `Docs/perf/m2-webgl-runs.csv`.

## master 판정 (2026-08-26 22:2x, master `84cc031b`)

- 자동 5지표 PASS(평균 140.58/140.69 · 하위1% 37.14/38.27 · soak 914.66s crash/TDR 0 · hitch 0) + 룩 조건 L1~L5 **5/5**(최종 빌드 재캡처 값 차이 0) + M2 대비 프레임타임 **개선**(WebGPU −10.93%, WebGL2 −0.23%). 프로세스 RAM은 M0b·M1·M2와 같은 사유(헤드리스 측정 불가)로 보류 → **조건부 PASS**. 후퇴 불필요. 태그 `v0.3.0-m3`.
- 감시 유지: programs 40/40(여유 0), WebGL2 하위1% 3회 범위 23.33~40.26(편차 큼). M3-15는 low 프리셋 포스트 체인 미구현(GTAO·bloom·LUT 0)이라 측정 대상 없음 — 미체크 유지, 근거 `Docs/perf/m3-effects.csv`.
- 별건(관문 외): 씬 tris 합산 증빙(`wt/loading`, R53-B)에서 §4-1 예산 600K 대비 low worst **816K FAIL**이 드러남(식생 GLB 132 tris×6000). 대응 옵션 grassLite(312K)·rockLite 준비 중 → 룩 검증 후 기본값 채택 여부 결정. M3-GATE 성능 수치는 이 위반 상태에서 측정된 값이다.
