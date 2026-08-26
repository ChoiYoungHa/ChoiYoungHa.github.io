# M5 성능 관문 재측정 (M5-14) — 초안

- 측정일 2026-08-27 02:44~03:14 (R108-A, worker-claude `4e4ecd5b`, main) / HEAD·build hash **`12869c0`**
- 조건: `Automation/build.ps1` exit 0(actual build) → `run-bench.mjs --skip-build --runs 3 --warmup 30`, 1280×720 `low`, `?route=bench` 60초 동선(routeHash `m0b-bench-v3-mainpath`), 헤드리스 Chrome(`--use-angle=d3d11`), ANGLE `Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11`
- 원본: `Docs/perf/m5-bench.csv`(WebGPU 3회+WebGL2 3회 병합), `m5-bench-r108-webgpu.csv`, `m5-bench-r108-webgl.csv`, `m5-bench-r108-webgl-rerun.csv`, soak `Docs/qa/m5-15min.md`, 예산 `Docs/qa/m5-budgets-{low,base}.json`(입력 `m5-gate-perf.json`), payload `Docs/perf/m5-payload.json`, pipelines `Docs/qa/m5-pipelines-{bench,s1}.json`
- 이 문서는 master 판정 전 초안이다. 로드맵 체크박스는 바꾸지 않는다.

## 1. 3회 측정 (중앙값 채택)

| run | backend | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs | 텍스처 GPU MB | JS heap peak MB | crash | errors |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | WebGPU | 124.89 | 27.79 | 0 | 63 | 62 | 71.87 | 169.54 | 0 | 0 |
| 2 | WebGPU | 125.37 | 30.74 | 0 | 63 | 62 | 71.87 | 229.51 | 0 | 0 |
| 3 | WebGPU | 125.51 | 31.49 | 0 | 63 | 62 | 71.87 | 294.80 | 0 | 0 |
| **median** | WebGPU | **125.37** | **30.74** | **0** | 63 | 62 | 71.87 | 229.51 | 0 | 0 |
| 1 | WebGL2 | 116.39 | 10.63 | 2 | 63 | 62 | 71.87 | 188.13 | 0 | 0 |
| 2 | WebGL2 | 103.38 | 5.03 | 4 | 48 | 66 | 71.87 | 247.49 | 0 | 0 |
| 3 | WebGL2 | 125.36 | 29.10 | 0 | 63 | 62 | 71.87 | 331.62 | 0 | 0 |
| **median** | WebGL2 | **116.39** | **10.63** | **2** | 63 | 62 | 71.87 | 247.49 | 0 | 0 |

WebGL2 1차 3회는 1·2회차에 1초 끊김 2·4회(2회차 calls 48·programs 66 — 동선 중 프레임 결손으로 최대치가 다르게 잡힘)가 들어가 중앙값 하위1% 10.63이었다. 같은 dist·같은 조건으로 **재측정 3회**(`m5-bench-r108-webgl-rerun.csv`):

| run | backend | 평균 fps | 하위 1% fps | 1초 끊김 | calls | programs |
|---|---|---:|---:|---:|---:|---:|
| 1 | WebGL2 재측정 | 121.65 | 16.83 | 1 | 63 | 62 |
| 2 | WebGL2 재측정 | 125.70 | 30.99 | 0 | 63 | 62 |
| 3 | WebGL2 재측정 | 125.31 | 29.66 | 0 | 63 | 62 |
| **median** | WebGL2 재측정 | **125.31** | **29.66** | **0** | 63 | 62 |

해석: WebGL2 끊김은 6회 중 3회에서 1~4회 발생했고, 발생 시점은 워밍업 직후 첫 수 초(셰이더 링크·텍스처 업로드)에 몰린다. 같은 시각 다른 워커가 CPU 작업(빌드·테스트)을 돌리는 환경이라 외부 간섭을 배제할 수 없다. **1차 측정값을 정식 줄로 두고 재측정을 참고 줄로 병기**한다 — 채택은 master 판단.

## 2. soak 15분 (WebGPU, `?route=bench` 반복)

elapsed 911.93s / 14 cycles / crash 0 / TDR 0 / context-lost 0 / errors 0 → **PASS** (`Docs/qa/m5-15min.md`).

## 3. 예산 (`check-budgets.mjs`, 입력 = WebGPU 중앙값)

| 지표 | low 한도 | 실측 | low | base 한도 | base |
|---|---:|---:|---|---:|---|
| calls | 200 | 63 | PASS | 350 | PASS |
| tris(추정기) | 600K | 312,434 | PASS | 1.1M | 704,834 PASS |
| programs | 40 | 62 | **FAIL** | 56 | **FAIL** |
| 텍스처 GPU MB | 300 | 71.87 | PASS | 550 | PASS |
| JS heap MB | 900 | 229.51 | PASS | 1200 | PASS |

- tris는 기존 `Docs/perf/m5-scene-tris-{low,base}.json`(buildHash `a1e7272`, R96) 값이다. `scene-tris.mjs` 재실행은 **`src/data/assets.csv` 18행(`asset.hero.tree.a`)의 note 필드에 따옴표 없는 쉼표가 있어 20열로 파싱돼 실패**한다(헤더 19열). R96 이후 tris에 영향을 주는 변경(집 GLB 높이 정규화·소품 높이)은 스케일만 바뀌어 삼각형 수는 같다.
- programs 62는 `renderer.info.memory.programs`(셰이더 스테이지 모듈 합). 계획서 §4-1 `≤40` 기준으로는 FAIL이다.

## 4. programs vs pipelines — 제안 A 기준 병기 (영하님 결정 대기)

`Docs/decisions/programs-budget-proposal.md` 제안 A(`WebGPU render pipelines ≤48`, 보조 `programs ≤72`·재질 ≤16·그림자 캐스터 그룹 ≤8) 기준으로 같은 빌드를 프로브했다(`renderer._pipelines.caches.size`, 5초 간격 샘플).

| 지점 | pipelines | programs(stages) | 재질 객체 | 텍스처(info) | 그림자 캐스터 메시 | 판정(제안 A) |
|---|---:|---:|---:|---:|---:|---|
| bench 동선 peak(10~70s 동일) | **48** | 63 | 15 | 15 | 14 | pipelines 48/48 **경계 PASS(여유 0)**, programs 63/72 PASS, 재질 15/16 PASS |
| S1 vista-mid 20s | 38 | 51 | 14 | 14 | 14 | PASS |

- 현행 계획서 기준(`programs ≤40`): **FAIL(62)**. 제안 A 기준: **PASS이나 여유 0** — M6 VFX +3 재질이 들어오면 초과가 확정적이므로 제안 A 승인 시에도 한도 재검토 또는 pipeline 절감(그림자 패스·지오메트리 레이아웃 통합)이 필요하다.
- 어느 기준을 쓸지는 **영하님 결정 항목**(로드맵 M6-01). 이 문서는 두 값을 병기만 한다.

## 5. payload (`check-payload.mjs --actual-build`)

boot 3.32MB(≤4MB) / core 누적 8.12MB(≤12MB) / 총 13.35MB → **PASS**. 경고 3(boot.js-main 선언 876,032 vs 실제 877,617 바이트·manifest phase/cumulative 요약 불일치) — manifest 갱신 대상(master).

## 6. 관문 판정 초안

| 지표 | 기준 | WebGPU | WebGL2(1차 / 재측정) | 판정 |
|---|---|---:|---:|---|
| 평균 fps | ≥30 | 125.37 | 116.39 / 125.31 | PASS |
| 하위 1% fps | ≥20 | 30.74 | **10.63** / 29.66 | WebGPU PASS · WebGL2 **1차 FAIL, 재측정 PASS** |
| 1초 끊김 | ≤2 | 0 | 2 / 0 | PASS(1차 경계) |
| 15분 무크래시 | crash·TDR·context-lost·errors 0 | PASS(911.93s) | — | PASS |
| tris | low ≤600K | 312K(추정기, R96 값) | 동일 | PASS(조건부: assets.csv 결함으로 재실행 불가) |
| 텍스처 GPU | ≤300MB | 71.87 | 71.87 | PASS |
| programs | 계획서 ≤40 | 62 | 62 | **FAIL** |
| pipelines | 제안 A ≤48 | 48 | — | PASS(여유 0, 승인 대기) |
| payload | boot ≤4MB·core ≤12MB | PASS | — | PASS |
| 프로세스 RAM | ≤24GB | 확인 불가(헤드리스) | — | **보류** — 영하님 실기 작업 관리자 측정 필요(`Docs/perf/process-ram-howto.md`) |

**초안 결론**: WebGPU 기본 경로는 fps·끊김·soak·텍스처·payload 전부 PASS. 미결 3건 — ① programs 예산 정의(계획서 40 FAIL vs 제안 A pipelines 48 경계 PASS), ② WebGL2 하위1% 1차 FAIL·재측정 PASS의 채택 규칙, ③ RAM 실기 측정. master 판정 전 M5-GATE는 GO 아님.

## 7. 잔존·결함

1. `src/data/assets.csv` 18행 note 쉼표 → `scene-tris.mjs`와 이를 쓰는 `lookdev-variants` trisCheck 전부 실패(소유: codex/master, 워커 수정 안 함).
2. `check-payload` 경고 3(manifest 바이트 불일치·요약 불일치).
3. bench 동선 프로브 중 콘솔 error 1건(`m5-pipelines-bench.json` consoleErrors=1) — 프레임 결손 없음, 본문은 미확인.
