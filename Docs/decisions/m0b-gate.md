# M0-b 성능 게이트 초안

측정일은 2026-08-26이며, actual build·720p `low`·`?route=bench` 60초 동선·30초 워밍업 조건이다(`계획서.md §4-3`). 이 문서는 master 판정 전 초안이므로 M0b-GATE 체크박스를 변경하지 않는다.

## 3회 중앙값

| 경로 | build hash | backend | routeHash | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs | texture GPU MB | JS heap peak MB | process RAM GB |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 기본 | `d487dca` | WebGPU | `m0b-bench-v2-m0-out-back-turn` | 143.28 | 72.04 | 0 | 9 | 10 | 18.55 | 24.33 | 확인 불가 |
| 강제 폴백 | `d487dca` | WebGL2 | `m0b-bench-v2-m0-out-back-turn` | 143.69 | 93.75 | 0 | 9 | 10 | 18.55 | 26.45 | 확인 불가 |

WebGL2 ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

## 5지표 판정 초안

| 지표 | 기준 | 실측 | 초안 판정 |
|---|---:|---:|---|
| 평균 fps | ≥30 | 143.28 | PASS |
| 하위 1% fps | ≥20 | 72.04 | PASS |
| 15분 무크래시 | elapsed≥900s, crash=0, TDR=0 | 905.75s, crash=0, TDR=0, context-lost=0 | PASS |
| 프로세스 RAM | ≤24GB | 확인 불가 — 영하님 수동 M0b-19 대기 | **판정 보류(PASS 아님)** |
| 1초 끊김 | ≤2 | 0 | PASS |

프로세스 RAM이 확인 불가이므로 전체 M0b-GATE는 아직 PASS가 아니다.

## 편차와 측정 주의

- WebGPU 3회 평균 fps는 142.34~143.50(범위 1.16, 중앙값 대비 0.81%)로 안정적이었다. 하위 1% fps는 58.66~83.16(범위 24.50, 중앙값 대비 34.01%)으로 편차가 컸다.
- WebGL2 3회 평균 fps는 143.50~143.95(범위 0.45, 중앙값 대비 0.31%)로 안정적이었다. 하위 1% fps는 85.78~125.90(범위 40.12, 중앙값 대비 42.79%)으로 편차가 컸다.
- 영하님의 다른 Chrome·GPU 사용은 통제하지 못했으므로 하위 1% 편차의 원인을 특정할 수 없다.
- 헤드리스 Chrome fps는 실제 화면을 그리는 일반 Chrome보다 높을 수 있다. 이 수치를 최종 사용자 체감 fps로 일반화하지 않는다.
- HEAD의 `run-bench.mjs`는 `--preset` 옵션을 받지 않고 `low`와 `?q=low`를 고정한다. coordinator 승인에 따라 중복 옵션 `--preset low`를 생략했으며 CSV의 preset 열은 모두 `low`다.
- 측정 중 HEAD가 `d487dca` → `39ef575` → `6b45b5d`로 변경됐다. M1 커밋 2개는 아직 런타임에 import되지 않는 데이터·테스트·에셋이며 세 빌드 모두 번들 `main-1kAsa1yr.js`가 동일했고, coordinator 확인상 해당 워커들은 build·GPU를 사용하지 않았다. CSV의 build hash는 `d487dca`, soak 보고서의 build hash는 `39ef575` 그대로 보존한다.

근거 파일: `Docs/perf/m0b-runs.csv`, `Docs/perf/m0b-webgl-runs.csv`, `Docs/qa/m0b-15min.md`.

## master 판정 (2026-08-26, master `84cc031b`)

- **M0b-19 프로세스 RAM**: 영하님이 실 Chrome으로 M0a-10 예비 측정 시 작업관리자 Chrome 합계 **≈2GB**(다른 탭 포함, 육안)를 보고하셨다. 정밀 캡처(PNG·CSV)는 미확보이나 기준 24GB 대비 12배 여유라 **조건부 PASS**로 인정한다. M1-GATE부터는 스크립트가 아닌 수동 캡처를 1회 확보한다.
- **M0b-GATE: PASS(조건부)** — 5지표 중 4개 실측 PASS + RAM 근사 실측. 헤드리스 fps 과대 가능성은 M1에서 영하님 실 화면 1회 대조로 보정.
- M0b-24 태그 `v0.0.0-bootstrap` = `f4f6149`.
- 미완 잔여: M0b-07 Blender 설치(영하님 수동, M1 지형은 절차적 생성으로 대체 결정 — 아래), M0b-23 20초 영상(영하님 수동, 선택).
