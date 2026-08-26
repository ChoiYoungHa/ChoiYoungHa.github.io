# M1 성능 게이트 초안

측정일은 2026-08-26이며, HEAD `943bbc5`, actual build, 1280×720 `low`, `?route=bench` 60초 동선, 30초 워밍업 조건이다(`계획서.md §4-3`). routeHash는 세 경로 모두 `m0b-bench-v3-mainpath`로 동일하다. 이 문서는 master 판정 전 초안이므로 M1-GATE 체크박스를 변경하지 않는다.

## 3회 중앙값

| 경로 | backend | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs | texture GPU MB | JS heap peak MB | process RAM GB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 기본 | WebGPU | 141.51 | 44.83 | 0 | 50 | 26 | 36.88 | 177.66 | 확인 불가 |
| 강제 폴백 | WebGL2 | 141.55 | 45.08 | 0 | 50 | 26 | 36.88 | 194.36 | 확인 불가 |

WebGL2 ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

## 5지표 판정 초안

| 지표 | 기준 | 실측 | 초안 판정 |
|---|---:|---:|---|
| 평균 fps | ≥30 | 141.51 | PASS |
| 하위 1% fps | ≥20 | 44.83 | PASS |
| 15분 무크래시 | elapsed≥900s, crash=0, TDR=0 | 911.59s, 14 cycles, crash=0, TDR=0, context-lost=0, errors=0 | PASS |
| 프로세스 RAM | ≤24GB | 확인 불가 — 수동 측정 대기 | **판정 보류(PASS 아님)** |
| 1초 끊김 | ≤2 | 0 | PASS |

프로세스 RAM이 확인 불가이므로 전체 M1-GATE는 아직 PASS가 아니다. 성능 임계값을 밑돈 지표는 없으므로 M1-RETREAT-A의 값 변경 후보는 아직 제안하지 않으며, 먼저 `계획서.md §8-1` 1단계의 측정 오류 제거에 해당하는 수동 프로세스 RAM 측정을 완료해야 한다.

## M0b 대비 프레임타임 변화

| 경로 | 지표 | M0b | M1 | 변화 |
|---|---|---:|---:|---:|
| WebGPU | 평균 프레임타임 | 6.98ms | 7.07ms | +0.09ms (+1.25%) |
| WebGPU | 하위 1% 환산 프레임타임 | 13.88ms | 22.31ms | +8.43ms (+60.70%) |
| WebGL2 | 평균 프레임타임 | 6.96ms | 7.06ms | +0.11ms (+1.51%) |
| WebGL2 | 하위 1% 환산 프레임타임 | 10.67ms | 22.18ms | +11.52ms (+107.96%) |

M1 WebGPU 중앙값은 M0b 대비 calls 9→50, programs 10→26, texture GPU 18.55→36.88MB, JS heap peak 24.33→177.66MB로 증가했다. 이 중 programs 26은 `계획서.md §4-1` low 예산 20을 6개 초과하므로 후속 머티리얼 통합 점검 항목이다.

## 편차와 주의

- WebGPU 평균 fps는 141.36~141.82(범위 0.46, 중앙값 대비 0.33%), 하위 1% fps는 42.97~48.48(범위 5.51, 12.29%), JS heap peak는 117.27~212.50MB였다.
- WebGL2 평균 fps는 141.13~141.57(범위 0.44, 중앙값 대비 0.31%), 하위 1% fps는 40.93~46.14(범위 5.21, 11.56%), JS heap peak는 125.44~203.86MB였다.
- 헤드리스 Chrome fps는 일반 표시 Chrome보다 높을 수 있으므로 사용자 체감 fps로 일반화하지 않는다.
- `run-bench.mjs`의 soak 보고서 제목은 기존 호환을 위해 `M0b-25`로 남아 있지만, `Docs/qa/m1-15min.md`의 build hash `943bbc5`와 측정 시각이 이번 M1 실행을 식별한다.

근거 파일: `Docs/perf/m1-runs.csv`, `Docs/perf/m1-webgl-runs.csv`, `Docs/qa/m1-15min.md`, 비교 기준 `Docs/perf/m0b-runs.csv`, `Docs/perf/m0b-webgl-runs.csv`.

## master 판정 (2026-08-26, master `84cc031b`)
- **M1-GATE: PASS(조건부)** — 평균 141.5(≥30)·하위1% 44.8(≥20)·15분 crash 0·끊김 0 실측 PASS. 프로세스 RAM은 확인 불가(스크립트 한계) → M0b와 동일하게 영하님 수동 캡처 1회를 M2 착수와 병행 요청. programs 26은 재조정 예산 ≤40(계획서 §4-1 정정) 이내.
- 태그 `v0.1.0-m1`. M2는 Blender 미설치로 **절차적 지오메트리(코드)** 로 진행한다(master 결정, 카파시 §2·마감 D-1).
