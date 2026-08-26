# M3-GATE 실행 runbook — R30-A 직후

- 작성일: 2026-08-26
- 작성 기준 HEAD: `3552126`(실행 build hash가 아님)
- 실행자: codex-A `54c832e9`
- 실행 시점: R30-A 산출물을 master가 검토·커밋한 뒤, GPU 단독 사용을 다시 보장받은 때
- 예상 소요: **약 55분(45~60분)**. 영하님 RAM 수동 캡처 대기와 도구 수정 시간은 제외한다.
- 단계 수: **12단계**

## 선행 결함 — build 1회 규약과 현재 runner 충돌

`Automation/run-bench.mjs:57`은 실행할 때마다 내부에서 `npm run build`를 호출한다. 따라서 아래 WebGPU·WebGL2·soak 3개 명령을 현행 그대로 실행하면 build가 3회이며, 별도 `npm run build`까지 실행하면 총 4회라 “build 1회” 규약을 충족하지 못한다.

**실행 전 STOP 조건**: master가 다음 둘 중 하나를 확정해야 한다.

- 권장: runner에 검증된 `--skip-build` 옵션을 추가한 커밋을 먼저 만들고, 이 runbook의 명령 3개에 `--skip-build`를 붙인다. 그러면 5단계의 build 1회를 모든 측정이 공유한다.
- 호환: runner를 수정하지 않고 6~8단계를 현행 명령으로 실행해 동일 clean HEAD를 3회 재빌드한다. 측정은 유효하지만 “총 build 1회”는 불충족으로 gate 문서에 편차를 명시한다.

이 문서는 현재 허용 범위가 문서뿐이므로 runner를 수정하지 않았다. 존재하지 않는 `--skip-build`를 현재 명령처럼 실행해서는 안 된다.

## 12단계 실행 절차

### 1. R30-A handoff와 clean HEAD 고정 — 3분

```powershell
git status --porcelain
git rev-parse --short HEAD
git diff --quiet
git diff --cached --quiet
git log -1 --oneline
```

- `git status --porcelain` 출력이 0줄이어야 한다.
- R30-A 최종 커밋 hash를 이후 모든 CSV·PNG·gate 문서의 build hash로 고정한다.
- 미커밋/미추적 파일이 하나라도 있으면 측정을 시작하지 않고 master에게 반환한다.

### 2. GPU·포트 단독 상태 확인 — 2분

```powershell
Get-NetTCPConnection -LocalPort 5173,4173,5183 -State Listen -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Select-Object Id,Path,StartTime
Get-Process chrome -ErrorAction SilentlyContinue | Select-Object Id,Path,StartTime
```

- 포트 listener와 web3d 관련 Node/headless Chrome 잔존이 없어야 한다.
- 영하님 소유 일반 Chrome은 종료하지 않는다. 시작 시 PID를 기록하고 runner가 만든 headless PID만 종료 후 0인지 대조한다.

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

- 세 PNG는 각각 `vista-start=S2`, `vista-mid=S1`, `vista-village=S3` 순서로 고정한다.
- PNG 3개는 정확히 1280×720, `low`, FOV 55°, 같은 final HEAD여야 한다.
- `l1-l5-decision.json`이 없거나 다른 파일명을 참조하면 R30-A 미완료로 보고 중단한다.

### 4. build 정책 확정 기록 — 1분

gate 초안 첫머리에 `build_mode=single+skip-build` 또는 `build_mode=runner-internal-x3`를 기록한다. 위 STOP 조건의 master 선택이 없으면 5단계로 진행하지 않는다.

### 5. production build 1회 — 2분

단일-build 모드에서만 다음 명령을 정확히 1회 실행하고 exit `0`과 build hash를 `Docs/qa/m3-smoke.md`에 기록한다.

```powershell
npm run build
$LASTEXITCODE
git rev-parse --short HEAD
```

호환 모드에서는 이 별도 명령을 생략하고 각 runner의 내부 build exit를 기록한다.

### 6. WebGPU 3회 — 약 5분

현행 runner 호환 명령:

```powershell
node Automation/run-bench.mjs --runs 3 --warmup 30 --output Docs/perf/m3-runs.csv
```

단일-build 모드에서는 검증·커밋된 옵션이 실제로 존재할 때에만 위 명령 끝에 `--skip-build`를 붙인다. CSV는 run 1~3과 median 행, backend `WebGPU`, preset `low`, 동일 routeHash, crash/errors 0을 가져야 한다.

### 7. WebGL2 3회 — 약 5분

```powershell
node Automation/run-bench.mjs --runs 3 --warmup 30 --gl webgl --output Docs/perf/m3-webgl-runs.csv
```

단일-build 모드의 `--skip-build` 규칙은 6단계와 같다. 세 run과 median의 backend는 `WebGL2`, routeHash는 WebGPU와 같아야 한다.

### 8. 900초 soak — 약 16분

```powershell
node Automation/run-bench.mjs --warmup 30 --soak 900 --soak-output Docs/qa/m3-15min.md
```

단일-build 모드의 `--skip-build` 규칙은 6단계와 같다. `elapsed≥900`, crash/TDR/context-lost/errors 모두 0을 확인하고 build exit와 함께 `Docs/qa/m3-smoke.md`에 요약한다. 생성기 제목이 `M0b-25`로 남아도 경로와 build hash로 M3를 식별하되 gate 문서에 명시한다.

### 9. M2 대비 프레임타임 델타 — 4분

입력은 `Docs/perf/m2-runs.csv`, `m2-webgl-runs.csv`, 방금 생성한 M3 CSV의 median 행이다.

```text
frame time (ms) = 1000 / fps
악화율 (%) = ((M3_ms - M2_ms) / M2_ms) × 100
```

M2 기준은 WebGPU 평균/하위1% `125.22/33.31`, WebGL2 `140.37/35.91`이다. 평균·하위1% 각각 두 backend를 계산해 입력·공식·결과를 `Docs/perf/m3-delta.md`에 기록한다. M3 로드맵에는 M2 대비 악화율 한도가 없으므로 이 값은 진단 지표이며, 정식 gate 기준으로 새로 만들지 않는다.

### 10. vista 3장 자동 L 재측정 — 2분

```powershell
node Automation/measure.mjs Docs/lookdev/m3-after-1.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-1-metrics.json
node Automation/measure.mjs Docs/lookdev/m3-after-2.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-2-metrics.json
node Automation/measure.mjs Docs/lookdev/m3-after-3.png --targets src/data/lookdev-targets.json --out Docs/lookdev/m3-after-3-metrics.json
```

각 명령 exit `0`, PNG hash·1280×720, L1/L2/L3/L5 값·PASS를 확인한다. `measure.mjs`의 L4는 수동 `null`이 정상이다.

### 11. L1~L5 결정 JSON 대조 — 5분

- `Docs/lookdev/l1-l5-decision.json`이 10단계의 세 metrics hash/값을 참조하는지 확인한다.
- L1·L2·L3·L5는 자동 재측정과 값/판정이 같아야 한다.
- L4는 S3 흑백에서 줄기/수관/하늘 3체크의 수동 근거 파일을 가져야 하며 `null`을 PASS로 세지 않는다.
- 최종 PASS 수는 5개 명제 중 `≥4`여야 한다. 불일치는 수치를 고치지 말고 gate 초안에서 FAIL/보류로 기록한다.

### 12. gate 초안·RAM·종료 정리 — 약 8분

`Docs/decisions/m2-gate.md`와 같은 구조로 `Docs/decisions/m3-gate.md`를 작성한다.

1. 측정일·HEAD·actual build·720p low·routeHash·build mode
2. WebGPU/WebGL2 3회 중앙값 표(avg, 1% low, hitch, calls, programs, texture, heap, RAM)
3. 공통 5지표: 평균≥30, 하위1%≥20, soak 무크래시, RAM≤24GB, hitch≤2
4. 룩 추가 조건: L1~L5 중 ≥4 PASS와 각 근거 파일
5. M2 대비 평균/하위1% 프레임타임 델타(진단)
6. 3회 편차·programs `≤40` 감시·console/build 이상
7. 초안 결론과 근거 파일 목록; 최종 판정/로드맵 체크는 master만 수행

RAM은 `Docs/perf/process-ram-howto.md` 방식으로 영하님이 M3 actual build 프로세스 트리 3회를 `Docs/perf/m3-process-ram.csv`에 기록해야 한다. 숫자가 없으면 **판정 보류(PASS 아님)**로 쓴다.

마지막으로 2단계의 포트·PID 명령을 재실행해 runner 소유 listener/headless Chrome/Node 잔존 0을 확인한다.

## 예상 산출물

| 산출물 | 생성/갱신 단계 |
|---|---:|
| `Docs/perf/m3-runs.csv` | 6 |
| `Docs/perf/m3-webgl-runs.csv` | 7 |
| `Docs/qa/m3-15min.md`, `Docs/qa/m3-smoke.md` | 8 |
| `Docs/perf/m3-delta.md` | 9 |
| `Docs/lookdev/m3-after-[1-3]-metrics.json` | 10 |
| `Docs/lookdev/l1-l5-decision.json` 검증 기록 | 11 |
| `Docs/perf/m3-process-ram.csv` | 영하님 수동 |
| `Docs/decisions/m3-gate.md` | 12 |

## 초안 판정 규칙

- 공통 5지표와 룩 `≥4/5`가 모두 PASS일 때만 전체 PASS 후보다.
- RAM 미측정은 보류이며 자동 PASS로 바꾸지 않는다.
- WebGPU 또는 WebGL2 어느 한쪽이라도 평균/하위1%/hitch 기준을 못 넘으면 해당 backend FAIL을 그대로 병기한다.
- programs가 40을 넘으면 렌더 예산 FAIL을 별도 결함으로 보고하되 master 지시 없이 후퇴 값을 바꾸지 않는다.
- M2 대비 델타는 진단 정보이며 M3-GATE의 새 합격선을 임의로 만들지 않는다.
