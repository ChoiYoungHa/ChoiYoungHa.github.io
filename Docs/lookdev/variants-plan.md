# 룩 변형 일괄 검증 계획 (R55-A, 2026-08-26)

> M3-GATE(codex-A, GPU) 종료 후 **한 GPU 세션**에서 대기 중인 룩 옵션 3종 + baseline 을 한꺼번에 캡처·측정·판정한다. 러너: `Automation/lookdev-variants.mjs`. 이 라운드는 `--dry-run` 과 Node 테스트(19/19)로만 검증했다 — 실제 캡처는 GATE 후.

## 1. GATE 후 실행 명령 (1줄)

```
node Automation/lookdev-variants.mjs --variants default --out-dir Docs/lookdev/variants
```

- 빌드 1회(`npm run build`) → 캡처(변형×vista×color/nohero) → `measure.mjs`(L1~L3·L5) → `l4-contrast.mjs`(L4 Δ·수목 bbox) → `Docs/lookdev/variants/variants-result.md` + `.json`.
- dist 를 이미 만들었으면 `--skip-build`. 특정 vista 만: `--shots S2`. 계획만 보려면 `--dry-run`.
- **예상 소요**: 빌드 ~40초 + 캡처당 ~25초(report.ts 의 `?shot=` 12초 지연 + 서버·크롬 기동·종료) × 13 ≈ **6분**(전부 지원 시). 현재 worktree 에서 지원되는 8캡처만이면 ≈ 4분. HDR 미로드 재캡처가 나면 +25초/건.
- 종료 시 포트 5183 free·크롬 0 을 확인한다(`Get-NetTCPConnection -LocalPort 5183`).

## 2. 변형 프리셋 `default` 와 판정

| 변형 | 쿼리 | 캡처 | 목표(targets) | 스위치 위치 |
|---|---|---|---|---|
| baseline | (없음) | S1·S2·S3 + S2 nohero | 기준(자동 PASS 합계·L4 Δ) | — |
| hazeDir | `hazeDir=1` | S1·S2·S3 | `s3.far.luma ≤ 145` | worker-codex `wt/loading` — **wt/claude 에 없음 → 병합 전엔 UNSUPPORTED** |
| heroContrast | `heroContrast=1&heroTrunk=0.75&heroCanopy=1.1` | S1·S2·S3 + S2 nohero | `l4.trunkCanopyDelta ≥ 10`, `l4.minDelta ≥ 10` | R54-A `HeroTree.tsx` ✓ |
| vistaPitch | `vistaPitch=22.1` | S1 + S1 nohero (S2·S3 는 baseline 재사용) | `s1.treeBboxTop > 0`(수관 꼭대기가 프레임 안) | **미구현** — `App.tsx` VistaCamera 에 `?vistaPitch=` 1줄 필요(§4) |

판정(`judge`, 순수 함수):
1. 자동 PASS 합계(3장 × L1·L2·L3·L5 = 12; 현재 baseline 8/12)가 baseline 보다 **작으면 REJECT**.
2. 그 위에서 targets 전부 만족 → **ADOPT 후보**, 아니면 REJECT + 수치(예: `s3.far.luma 150 !<= 145`).
3. 쿼리 스위치가 `src/**/*.ts(x)` 에 없으면 UNSUPPORTED(캡처 생략) — baseline 과 같은 그림을 재서 "PASS" 라고 적는 일을 막는다.

HDR 로드 대기 규칙(R22·R30 교훈 재사용): 캡처 후 상단 2밴드 휘도 > 235(흰 하늘) 이거나 nohero 짝의 상단 밴드가 본 캡처와 15 이상 다르면 1회 재캡처. png 가 안 오면(캔버스 5KB 미만) 실패.

## 3. 결과 표 형식 (`variants-result.md`)

| 변형 | 판정 | 자동 PASS | S3 원경 휘도 | L4 줄기/수관 Δ | L4 최소 Δ | S1 수목 bbox top | 사유 |

`variants-result.json` 에는 변형 정의·스위치 지원 여부·행별 metrics(`s1/s2/s3.{near,far,pass,L5}`, `l4.{trunk,canopy,sky,checks}`, `treeBbox`) 전부.

## 4. 채택 시 절차 (master 승인 후)

1. `variants-result.md` 의 ADOPT 후보 행과 baseline 행을 master 에게 보고(수치 그대로).
2. 승인되면 기본값 승격:
   - heroContrast → `src/data/lookdev.json` `heroContrast.enabled=true`, `trunkLumaScale=0.75`, `canopyLumaScale=1.1`(`test-hero-contrast.mjs` 의 "기본 off" 단언은 채택값으로 갱신).
   - vistaPitch → `src/data/vistas.json` vista-mid 에 `pitchDeg: 22.1`(`Docs/lookdev/vista-pitch-candidates.md` §3) — 이후 `l1-l5-decision.json` 의 S1 L1~L3 재판정.
   - hazeDir → worker-codex 파일(`wt/loading`) 기본값 — codex 쪽 절차.
3. 승격 후 baseline 만 다시 `--shots` 전부로 1회 실행해 `l1-l5-decision.json` 갱신(캡처 파일을 `Docs/lookdev/m3-after-*` 규약으로 복사).

## 5. 이번 라운드 제약·결함

- `vistaPitch` 쿼리 스위치는 이 라운드 허용 파일 밖(`App.tsx`)이라 넣지 않았다. 필요한 변경 1줄: `VistaCamera` 의 `pitchDeg` 계산에 `Number(new URLSearchParams(location.search).get('vistaPitch'))`(부재 null 은 0 으로 떨어지므로 raw null 을 먼저 거른다) 를 우선 적용. master 승인 후 R56 이후.
- `hazeDir` 는 `wt/loading` 병합 뒤에만 지원 → 그 전 실행은 UNSUPPORTED 로 기록된다.
- `run-bench.mjs` 의 Chrome 기동 인자·`findChrome`·`killChromeProfile` 은 export 되지 않아 **최소 복제**했다(CDP 연결은 하지 않는다 — 종료 판정은 probe-server 의 `RESULT` 로그). `probe-server.mjs` 는 `Docs/m0a/` 에 저장하므로 캡처마다 `--out-dir` 로 **이동**한다.
- 흑백 PNG 는 러너가 Rec.709 로 만든다(colorType 0). `measure.mjs` 는 gray 를 거부하므로 L4 는 `l4-contrast.mjs` 디코더로 읽는다(테스트로 고정).
