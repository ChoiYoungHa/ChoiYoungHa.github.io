# M3-GATE 실행 runbook — 병합 HEAD 사전 점검

- 갱신일: 2026-08-26
- runbook 갱신 기준 HEAD: `03a9c91`(main `8edb15e` 병합 완료; 실제 측정 build hash는 실행 시 확정)
- 실행자: codex-A `54c832e9`
- 실행 시점: R30-A 산출물을 master가 검토·커밋하고 GPU 단독 사용을 보장한 뒤
- 예상 소요: **약 54분(50~60분)**. 영하님 RAM 수동 캡처 대기 시간은 제외한다.
- 단계 수: **11단계**

## 사전 점검 스냅샷

- 룩 결정: `Docs/lookdev/l1-l5-decision.json`의 `passCount=5`, 즉 **L1~L5 5/5 PASS**. gate 최소 조건은 기존대로 `≥4/5`다.
- 성능 경계: 같은 파일의 단발 측정은 programs `40/40`, 1% low `19.9fps`다. programs는 여유 0이고 1% low는 20fps 관문보다 0.1 낮으므로, 단발 FAIL로 확정하지 않고 아래 동일 조건 3회 중앙값과 편차로 재판정한다.
- M2 델타 기준 파일: WebGPU `Docs/perf/m2-runs.csv`, WebGL2 `Docs/perf/m2-webgl-runs.csv`.

## 확정된 build 정책

`Automation/run-bench.mjs`의 기본 build 정책은 `--build-once`다. 첫 WebGPU 명령에서 production build를 정확히 한 번 수행하고, WebGL2와 soak 명령은 `--skip-build`로 그 `dist`를 재사용한다. 두 옵션을 한 명령에 함께 쓰면 인자 오류이며, `--skip-build` 때 `dist`가 없으면 명확한 오류와 exit `2`로 중단한다.

별도 `npm run build`는 실행하지 않는다. 최종 측정 명령 3줄은 다음과 같다.

```powershell
node Automation/run-bench.mjs --build-once --runs 3 --warmup 30 --output Docs/perf/m3-runs.csv
node Automation/run-bench.mjs --skip-build --runs 3 --warmup 30 --gl webgl --output Docs/perf/m3-webgl-runs.csv
node Automation/run-bench.mjs --skip-build --warmup 30 --soak 900 --soak-output Docs/qa/m3-15min.md
```

## 11단계 실행 절차

### 1. R30-A handoff와 clean HEAD 고정 — 3분

```powershell
git status --porcelain
git rev-parse --short HEAD
git diff --quiet
git diff --cached --quiet
git log -1 --oneline
```

- `git status --porcelain` 출력이 0줄이어야 한다.
- R30-A 최종 commit hash를 모든 CSV·PNG·gate 문서의 build hash로 고정한다.
- 미커밋/미추적 파일이 하나라도 있으면 측정을 시작하지 않고 master에게 반환한다.

### 2. GPU·포트 단독 상태 확인 — 2분

```powershell
Get-NetTCPConnection -LocalPort 5173,4173,5183 -State Listen -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,Path,StartTime
Get-Process chrome -ErrorAction SilentlyContinue | Select-Object Id,Path,StartTime
```

- web3d 관련 listener, Node, headless Chrome 잔존이 없어야 한다.
- 영하님 소유 일반 Chrome은 종료하지 않는다. 시작 PID를 기록하고 runner 소유 프로세스만 종료 후 대조한다.

### 3. 룩 판정 입력 완비 확인 — 2분

```powershell
@(
  'Docs/lookdev/m3-after-1.png',
  'Docs/lookdev/m3-after-2.png',
  'Docs/lookdev/m3-after-3.png',
  'Docs/lookdev/l1-l5-decision.json',
  'src/data/lookdev-targets.json'
) | ForEach-Object { [PSCustomObject]@{ Path=$_; Exists=Test-Path $_ } }
```

- PNG 순서는 `vista-start=S2`, `vista-mid=S1`, `vista-village=S3`로 고정한다.
- PNG 3개는 정확히 1280×720, `low`, FOV 55°, 같은 final HEAD여야 한다.
- 결정 JSON이 없거나 다른 metrics 파일을 참조하면 R30-A 미완료로 보고하고 중단한다.

### 4. build 정책과 hash 기록 — 1분

gate 초안 첫머리에 `build_mode=first-run-build-once+reuse-dist`를 기록한다. 1단계 HEAD와 첫 명령이 CSV에 기록한 `build_hash`가 다르면 이후 측정을 중단한다.

### 5. WebGPU 3회 + production build 1회 — 약 6분

```powershell
node Automation/run-bench.mjs --build-once --runs 3 --warmup 30 --output Docs/perf/m3-runs.csv
```

- 이 명령만 내부에서 `npm run build`를 정확히 한 번 실행한다. exit `0`과 build hash를 `Docs/qa/m3-smoke.md`에 기록한다.
- CSV 스키마는 기존과 동일하며 run 1~3과 median 행, backend `WebGPU`, preset `low`, 동일 routeHash, crash/errors 0이어야 한다.
- 특히 programs `≤40`과 1% low `≥20fps`를 run별·중앙값으로 기록한다. `40` 또는 `19.9` 부근이면 반올림 전 원값과 3회 범위를 함께 병기한다.

### 6. WebGL2 3회 — 약 5분

```powershell
node Automation/run-bench.mjs --skip-build --runs 3 --warmup 30 --gl webgl --output Docs/perf/m3-webgl-runs.csv
```

- 5단계의 `dist`를 재사용하며 build를 호출하지 않는다.
- 세 run과 median의 backend는 `WebGL2`이고 routeHash는 WebGPU와 같아야 한다.
- WebGPU와 동일하게 programs 40 상한·1% low 20fps 관문을 run별·중앙값으로 감시한다.

### 7. 900초 soak — 약 16분

```powershell
node Automation/run-bench.mjs --skip-build --warmup 30 --soak 900 --soak-output Docs/qa/m3-15min.md
```

- 5단계의 `dist`를 다시 재사용하며 build를 호출하지 않는다.
- `elapsed≥900`, crash/TDR/context-lost/errors 모두 0인지 확인하고 `Docs/qa/m3-smoke.md`에 요약한다.
- 생성기 제목이 `M0b-25`로 남아도 경로와 build hash로 M3를 식별하고 gate 문서에 명시한다.

### 8. M2 대비 프레임타임 델타 — 4분

입력은 `Docs/perf/m2-runs.csv`, `Docs/perf/m2-webgl-runs.csv`, 방금 생성한 두 M3 CSV의 median 행이다.

```text
frame time (ms) = 1000 / fps
악화율 (%) = ((M3_ms - M2_ms) / M2_ms) × 100
```

M2 기준은 WebGPU 평균/하위1% `125.22/33.31`, WebGL2 `140.37/35.91`이다. 평균·하위1%를 backend별로 계산해 입력·공식·결과를 `Docs/perf/m3-delta.md`에 기록한다. 이 값은 M3 진단 지표이며 새 합격선을 만들지 않는다.

### 9. vista 3장 L 재측정 — 2분

```powershell
node Automation/measure.mjs Docs/lookdev/m3-after-1.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-1-metrics.json
node Automation/measure.mjs Docs/lookdev/m3-after-2.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-2-metrics.json
node Automation/measure.mjs Docs/lookdev/m3-after-3.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-3-metrics.json
```

각 명령 exit `0`, PNG hash·1280×720, L1/L2/L3/L5 값·PASS를 확인한다. `measure.mjs`에서 L4가 수동 `null`인 것은 정상이다.

### 10. L1~L5 결정 JSON 대조 — 5분

- `Docs/lookdev/l1-l5-decision.json`이 9단계의 세 metrics hash와 값을 참조하는지 대조한다.
- L1·L2·L3·L5는 자동 재측정과 값/판정이 같아야 한다.
- L4는 S3 흑백에서 줄기/수관/하늘 3체크의 수동 근거가 있어야 하며 `null`을 PASS로 세지 않는다.
- 병합 시점의 `Docs/lookdev/l1-l5-decision.json`은 **5/5 PASS**다. 재측정과 대조 후에도 최종 룩 조건은 5개 명제 중 **L≥4/5 PASS**이며, 불일치는 고치지 않고 gate 초안에서 FAIL/보류로 기록한다.

### 11. gate 초안·RAM·종료 정리 — 약 10분

`Docs/decisions/m2-gate.md`와 같은 형식으로 `Docs/decisions/m3-gate.md`를 작성한다.

1. 측정일·HEAD·actual build·720p low·routeHash·build mode
2. WebGPU/WebGL2 3회 중앙값과 편차(avg, 1% low, hitch, calls, programs, texture, heap, RAM)
3. 공통 5지표: 평균≥30, 하위1%≥20, soak 무크래시, RAM≤24GB, hitch≤2
4. 룩 추가 조건: L1~L5 중 ≥4 PASS와 각 근거 파일
5. M2 대비 평균/하위1% 프레임타임 델타(진단)
6. programs `≤40`, console/build 이상, 초안 결론과 근거 파일 목록

RAM은 `Docs/perf/process-ram-howto.md` 방식으로 영하님이 M3 actual build 프로세스 트리 3회를 `Docs/perf/m3-process-ram.csv`에 기록해야 한다. 숫자가 없으면 **판정 보류(PASS 아님)**로 쓴다. 최종 판정과 로드맵 체크는 master만 수행한다.

마지막으로 2단계의 포트·PID 명령을 재실행해 runner 소유 listener/headless Chrome/Node 잔존 0을 확인한다.

## 예상 산출물

| 산출물 | 생성/갱신 단계 |
|---|---:|
| `Docs/perf/m3-runs.csv` | 5 |
| `Docs/perf/m3-webgl-runs.csv` | 6 |
| `Docs/qa/m3-15min.md`, `Docs/qa/m3-smoke.md` | 7 |
| `Docs/perf/m3-delta.md` | 8 |
| `Docs/lookdev/m3-after-[1-3]-metrics.json` | 9 |
| `Docs/lookdev/l1-l5-decision.json` 대조 기록 | 10 |
| `Docs/perf/m3-process-ram.csv` | 영하님 수동 |
| `Docs/decisions/m3-gate.md` | 11 |

## 초안 판정 규칙

- 공통 5지표와 룩 `≥4/5`가 모두 PASS일 때만 전체 PASS 후보다.
- RAM 미측정은 보류이며 자동 PASS로 바꾸지 않는다.
- 어느 backend라도 평균/하위1%/hitch 기준을 못 넘으면 해당 FAIL을 그대로 병기한다.
- programs가 40을 넘으면 렌더 예산 FAIL을 별도 결함으로 보고하고 master 지시 없이 후퇴 값을 바꾸지 않는다.
- M2 대비 델타는 진단 정보이며 M3-GATE의 새 합격선을 임의로 만들지 않는다.
