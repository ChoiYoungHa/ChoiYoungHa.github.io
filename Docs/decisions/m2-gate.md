# M2 성능 게이트 초안

측정일은 2026-08-26이며, HEAD `9c86125`, actual build, 1280×720 `low`, `?route=bench` 60초 동선, 30초 워밍업 조건이다(`계획서.md §4-3`). WebGPU·WebGL2 각 3회의 routeHash는 모두 `m0b-bench-v3-mainpath`로 동일하다. 이 문서는 master 판정 전 초안이므로 M2-GATE 체크박스를 변경하지 않는다.

## 3회 중앙값

| 경로 | backend | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs | texture GPU MB | JS heap peak MB | process RAM GB |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 기본 | WebGPU | 125.22 | 33.31 | 0 | 63 | 40 | 36.88 | 193.07 | 확인 불가 |
| 강제 폴백 | WebGL2 | 140.37 | 35.91 | 0 | 63 | 40 | 36.88 | 213.92 | 확인 불가 |

WebGL2 ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

## 5지표 판정 초안

| 지표 | 기준 | 실측 | 초안 판정 |
|---|---:|---:|---|
| 평균 fps | ≥30 | WebGPU 125.22 / WebGL2 140.37 | PASS |
| 하위 1% fps | ≥20 | WebGPU 33.31 / WebGL2 35.91 | PASS |
| 15분 무크래시 | elapsed≥900s, crash=0, TDR=0 | 915.4s, 14 cycles, crash=0, TDR=0, context-lost=0, errors=0 | PASS |
| 프로세스 RAM | ≤24GB | 확인 불가 — 수동 측정 대기 | **판정 보류(PASS 아님)** |
| 1초 끊김 | ≤2 | WebGPU 0 / WebGL2 0 | PASS |

## M2 추가 조건

| 조건 | 기준 | 실측 | 초안 판정 |
|---|---:|---:|---|
| M1 대비 평균 프레임타임 악화 | ≤25% | WebGPU +13.01% / WebGL2 +0.84% | PASS |
| 관통 | 0 | `Docs/qa/m2-route.csv`: 3회 모두 penetration=0 | PASS |

하위 1% 환산 프레임타임 악화율은 WebGPU `+34.58%`, WebGL2 `+25.54%`다. 로드맵이 평균 프레임타임을 추가 조건의 주 판정으로 지정하므로 이 값은 FAIL 조건이 아니라 순간 프레임 편차 주의 지표로 병기한다(`Docs/perf/m2-delta.md`).

## 3회 편차

| backend | 평균 fps 범위 | 중앙값 대비 범위 | 하위 1% fps 범위 | 중앙값 대비 범위 | JS heap peak 범위 |
|---|---:|---:|---:|---:|---:|
| WebGPU | 124.78~125.32 (폭 0.54) | 0.43% | 31.45~33.78 (폭 2.33) | 6.99% | 119.53~200.59MB |
| WebGL2 | 140.18~141.02 (폭 0.84) | 0.60% | 34.64~41.03 (폭 6.39) | 17.79% | 133.88~216.00MB |

두 백엔드 모두 평균 fps 편차는 1% 미만이나 하위 1% 편차는 더 크다. 그래도 각 run의 하위 1% 최저값은 WebGPU `31.45`, WebGL2 `34.64`로 관문 `20fps`를 넘었다.

## 예산과 이상

- calls `63`은 low 예산 `≤200` 이내다.
- programs `40`은 low 예산 `≤40`과 정확히 같아 여유가 `0`이다.
- texture GPU `36.88MB`는 low 예산 `≤300MB`, JS heap 중앙값은 두 경로 모두 `≤900MB` 이내다.
- Production build는 exit `0`이지만 Vite native config loader의 `__dirname` 호환 경고와 500kB 초과 chunk 경고가 남았다.
- Chrome stderr의 Google GCM `DEPRECATED_ENDPOINT`는 앱 page error와 분리했으며 bench report errors는 `0`이다.
- `Docs/qa/m2-15min.md` 제목은 생성기 호환 때문에 `M0b-25`로 남지만 build hash `9c86125`와 파일 경로가 이번 M2 측정을 식별한다.

## 초안 결론

자동 측정 가능한 5지표 중 4개와 M2 추가 조건 2개는 PASS다. 프로세스 총 RAM이 확인 불가이므로 전체 M2-GATE는 **판정 보류(PASS 아님)**이며, 최종 판정과 후퇴 여부는 master가 결정한다.

근거 파일: `Docs/perf/m2-runs.csv`, `Docs/perf/m2-webgl-runs.csv`, `Docs/perf/m2-delta.md`, `Docs/qa/m2-route.csv`, `Docs/qa/m2-smoke.md`, `Docs/qa/m2-15min.md`, 비교 기준 `Docs/perf/m1-runs.csv`, `Docs/perf/m1-webgl-runs.csv`, `Docs/decisions/m1-gate.md`.

## master 판정 (2026-08-26 20:2x, master `84cc031b`)

- 자동 측정 5지표 중 4개 PASS, 프로세스 RAM은 헤드리스에서 확인 불가 → **M0b·M1 GATE와 동일 기준으로 조건부 PASS.** RAM 근거는 영하님 수동 캡처(작업관리자 Chrome 프로세스 트리) 1장으로 M0b·M1·M2를 일괄 보완한다.
- M2 추가 조건 2개(평균 프레임타임 악화 WebGPU +13.01%·WebGL2 +0.84% ≤25%, 관통 0) PASS. 하위 1% 환산 악화(+34.58%/+25.54%)는 병기 정보로 보존하며 M3에서 programs 40(상한, 여유 0)과 함께 후퇴 사다리 1순위 감시 항목이다.
- 후퇴(M2-RETREAT-*) 불필요. **M2-GATE: 조건부 PASS** → 태그 `v0.2.0-m2`.
