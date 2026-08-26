# `run-bench.mjs` 스모크

- 실행일: 2026-08-26
- 기준 HEAD: `7485a4f`
- 주의: R13-A의 `src/` 변경이 동시에 진행 중인 공유 작업 트리에서 실행했다. 아래 수치는 관문 판정에 쓰지 않는다.
- 공통 결과: `npm run build` exit 0, 결과 POST 수신, CSV 1행+중앙값 행 생성, 종료 후 4173 LISTEN 0·`web3d-bench-*` Chrome 프로세스 0.

## 기본 경로 (`--runs 1 --warmup 1`)

| backend | preset | routeHash | avg fps | low 1% fps | hitch 1s | calls | programs | texture GPU MB | JS heap MB | process RAM | crash | errors |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| WebGPU | low | `m0b-bench-v1-p0-village-path-tree-turn` | 141.76 | 65.49 | 0 | 12 | 6 | 10.55 | 13.83 | 확인 불가 | 0 | 0 |

ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`

## WebGL 강제 경로 (`--runs 1 --warmup 0 --gl webgl`)

| backend | preset | routeHash | avg fps | low 1% fps | hitch 1s | calls | programs | texture GPU MB | JS heap MB | process RAM | crash | errors |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| WebGL2 | low | `m0b-bench-v1-p0-village-path-tree-turn` | 142.65 | 72.14 | 0 | 12 | 6 | 10.55 | 12.69 | 확인 불가 | 0 | 0 |

ANGLE: `ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`

## 정식 실행 보류

M0b-21·22의 `--runs 3 --warmup 30`과 M0b-25의 `--soak 900`은 R13-A 통합 후 실행해야 하므로 이 스모크에서 수행하지 않았고, 로드맵 체크박스도 변경하지 않았다.
