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
| vistaPitch | `vistaPitch=22.1` | S1 + S1 nohero (S2·S3 는 baseline 재사용) | `s1.treeBboxTop > 0`(수관 꼭대기가 프레임 안) | R57-A `App.tsx` VistaCamera ✓(master 승인, `?vistaPitch=` 우선 → marker.pitchDeg → 0) |
| grassLite (R57-A) | `grassLite=1` | S1·S2·S3 | 자동 PASS 합계 ≥ baseline **그리고** `tris.worstCase ≤ 600000`(`scene-tris.mjs --preset low --grass-lite` 실행, 리포트 `scenarios.worstCase.totalTriangles`) | worker-codex `wt/loading`(`Foliage.tsx`·`grassLiteGeometry.ts`·`scene-tris.mjs`) — 병합 전 UNSUPPORTED |
| combo (R57-A) | `hazeDir=1&heroContrast=1&heroTrunk=0.75&heroCanopy=1.1&grassLite=1` | S1·S2·S3 + S2 nohero | hazeDir·heroContrast·grassLite 목표 4개 전부 | 셋 다 있어야 함 — **최종 후보** |

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

- ~~`vistaPitch` 쿼리 스위치 미구현~~ → R57-A 에서 master 승인으로 `App.tsx` VistaCamera 에 적용(`?vistaPitch=` raw null 먼저 거름 → marker.pitchDeg → 0). dry-run `vistaPitch=yes`.
- `hazeDir`·`grassLite`·`scene-tris.mjs` 는 `wt/loading` 병합 뒤에만 지원 → 그 전 실행은 UNSUPPORTED 로 기록된다(현재 dry-run: 6 변형 20 캡처 중 10 runnable).

## 6. 병합 대비 점검 (R57-A, 읽기만 — main `87ee4d6`)

| 브랜치 | main 대비 변경 | 파일 수 |
|---|---|---|
| `wt/claude` | `Automation/{l4-contrast,lookdev-variants,test-final-route,test-hero-contrast,test-lookdev-variants}.mjs` · `Docs/lookdev/{l4-contrast-plan,variants-plan,vista-pitch-candidates}.md` · `Docs/qa/m3-l4-contrast.json` · `src/App.tsx` · **`src/data/lookdev.json`** · `src/data/vistas.json` · `src/main.tsx` · `src/scene/HeroTree.tsx` · `src/scene/hero/heroTreeGeometry.ts` · `src/systems/bench/{benchRoute,finalRoute,finalRouteRunner}.ts` | 18 (+1,724 −13) |
| `wt/loading` | `Automation/{check-budgets,scene-tris,test-grass-lite,test-haze-direction,test-scene-tris}.mjs` · `Docs/perf/m4-scene-tris.json` · `Docs/qa/{m3-hazedir-design,m4-grass-lite}.md` · **`src/data/lookdev.json`** · `src/scene/Foliage.tsx` · `src/scene/SkyDome.tsx` · `src/scene/foliage/grassLiteGeometry.ts` · `src/scene/sky/hazeDirection.ts` | 13 (+1,595 −14) |
| `wt/bench` | (main 과 차이 없음 — 이미 병합됨) | 0 |

**겹치는 파일: `src/data/lookdev.json` 1개뿐.** `Foliage.tsx`·`SkyDome.tsx` 는 loading 만, `HeroTree.tsx`·`App.tsx` 는 claude 만 건드린다.
- claude: 파일 끝에 `heroContrast` 키 추가(7줄). loading: `volumetricClouds` 뒤 `grassLite` 키(7줄) + `sky` 안 `hazeDirection`(6줄).
- `git merge-tree --write-tree wt/claude wt/loading` → 충돌 0, "Auto-merging src/data/lookdev.json". 병합 트리의 lookdev.json 키: `skyTexture,exposure,toneMapping,sun,volumetricClouds,grassLite,integration,sky,heroContrast` + `sky.hazeDirection` — 세 키 전부 보존.

**병합 순서 제안**: ① `wt/loading` → main(tris 예산 FAIL 대응·hazeDir 는 GATE 판정에 직접 걸리는 항목) ② `wt/claude` → main(러너·hero 파라미터는 전부 기본 off, 충돌 없음) ③ 병합된 main 에서 `node Automation/lookdev-variants.mjs --variants default --out-dir Docs/lookdev/variants` 1회(6 변형 20 캡처 ≈ 9분) → 결과표로 채택 결정. 순서를 바꿔도(claude 먼저) 결과는 같다 — lookdev.json 이 auto-merge 되므로. 어느 쪽이든 병합 후 `npx tsc -b`·`node --test Automation/test-hero-contrast.mjs Automation/test-lookdev-variants.mjs Automation/test-grass-lite.mjs` 로 회귀 확인.
- `run-bench.mjs` 의 Chrome 기동 인자·`findChrome`·`killChromeProfile` 은 export 되지 않아 **최소 복제**했다(CDP 연결은 하지 않는다 — 종료 판정은 probe-server 의 `RESULT` 로그). `probe-server.mjs` 는 `Docs/m0a/` 에 저장하므로 캡처마다 `--out-dir` 로 **이동**한다.
- 흑백 PNG 는 러너가 Rec.709 로 만든다(colorType 0). `measure.mjs` 는 gray 를 거부하므로 L4 는 `l4-contrast.mjs` 디코더로 읽는다(테스트로 고정).
