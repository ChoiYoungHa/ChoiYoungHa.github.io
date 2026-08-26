# 계획서·로드맵 정정 후보 목록 + 채택 시 기본값 반영 절차 (R61-A, 2026-08-26)

> 작성: worker-claude `4e4ecd5b`. **후보만 — `계획서.md`·`로드맵.md`·`문제정의.md` 적용은 master.** 근거는 전부 파일·수치로 실측한 것이며, 판정 없이 "현재 표기 → 정정안"만 적는다. main HEAD `4cd7029`(wt/claude 병합) 기준.
>
> 영향 분류: **설계** = 값·구조가 바뀌어 다른 절·코드에 파급 / **체크** = 로드맵 행 완료 조건·산출물 열 표기만 / **없음** = 문구·근거 갱신(값 불변).

## 1. 정정 후보 표 (14건)

| # | 문서 | 절 | 현재 표기 | 정정안 | 근거 파일 · 수치 | 영향 |
|---|---|---|---|---|---|---|
| 1 | 계획서 | §6-2 표 C(색상 시프트) | `hue = mix(hue_near, 210°, depthFactor * 0.85)` | `… depthFactor * 0.97` (hueStrength 0.97). 0.85 는 근경 hue 48°→원경 186°에서 멈춰 목표 205~215°에 못 든다 | `Docs/lookdev/l1-l5-decision.json` settings.depthGrade.hueStrength=0.97 · `m3-plan.md` §3 시뮬(0.85→185.8°, 0.97→205.2°) · 로드맵 M3-05C 완료일 "(hueStrength 0.97)" · 실측 S1 원경 hue 212.2 | 설계 (값) |
| 2 | 계획서 | §6-2 표 D(휘도 상승) | `luminance += depthFactor * 0.35` | `* 0.34` (lumaGain 0.34). 0.35 는 시뮬 144.5 로 상한 145 경계 | `l1-l5-decision.json` lumaGain=0.34 · 로드맵 M3-05D "(lumaGain 0.34)" | 설계 (값, 미세) |
| 3 | 계획서 | §6-2 톤매핑·노출 표 "톤매퍼" | `AgXToneMapping` **(추정)** | `NeutralToneMapping`(상수 7) **채택** — 같은 프레임 3장 비교: 근경 채도 AgX 10.4~10.9% / ACES 14.3~14.8% / Neutral 25.2~27.1%. AgX·ACES 는 L1 근경 목표 30~36% 에 도달 불가 | `Docs/lookdev/m3-tonemap.md` 표 · `m3-s3d035{agx,neutral,aces}-{1,2,3}-metrics.json` · `l1-l5-decision.json` toneMapping=Neutral · 로드맵 M3-14 완료 | 설계 (값) — §9 미확정표 8번도 "확정" 으로 |
| 4 | 계획서 | §6-2 "노출" | `toneMappingExposure` 1.0 (0.85~1.25 튜닝) | **0.44** (튜닝 범위 0.40~0.50). Neutral 에서 0.35→근경 휘도 55(하한 60 미달), 0.44→66~67(목표 60~75). 1.0 은 R3F 기본 ACES 에서 근경 141 | `src/data/lookdev.json` exposure.start=0.44 + note · `m3-tonemap.md` 판정 · `l1-l5-decision.json` L3 near 67.3 | 설계 (값) |
| 5 | 계획서 | §2-3 "적용 규약" 코드·표 | `createRenderer` 안에서 톤매퍼를 설정하면 된다는 전제(설정 코드 없음) | **주의 항목 추가**: R3F `<Canvas>` 는 gl 생성 뒤 기본 톤매퍼(ACESFilmic; `flat` 이면 None)를 덮어쓴다 → `<Canvas flat onCreated={({gl}) => applyToneMapping(gl)}>` 로만 적용된다. M2 까지 "톤매핑 없음" 으로 알았던 실제 톤매퍼는 ACES 였다 | `src/App.tsx` `flat`·`onCreated(applyToneMapping)` · `src/gl/createRenderer.ts` applyToneMapping · `m3-tonemap.md` 부수 발견 · `m3-plan.md` §1 R30-A 정정 | 설계 (규약 추가, 값 불변) |
| 6 | 계획서 | §3-6 "그림자 캐스케이드 × 해상도" 2×1024² / 3×2048², §4-1 "그림자 캐스터 광원 1", §6-2 "방향광 1개 + CSM 그림자" | CSM(캐스케이드) 전제 | three r185 `examples/jsm/csm/CSM.js` 는 **WebGLRenderer 전용**(ShaderChunk 패치·onBeforeCompile) → WebGPU NodeMaterial 비호환. 채택: **단일 그림자 프러스텀 폴백** — 방향광 1개, 프리셋별 mapSize 1024/2048·최대거리 80/150m·`frustumHalfExtent` 40/…; `activeCascades` 1. 표기를 "캐스케이드 2×1024²" → "단일 캐스케이드 1024² (CSM 비호환 폴백, 계획 2단은 `CSMShadowNode.js` 통합 시 재검토)" 로 | `Docs/qa/m3-shadow-config.json` decision.adopted=`single-shadow-frustum-fallback`, csmEvidence.legacy.compatibleWithWebGPURendererNodeMaterial=false, nodeAlternative CSMShadowNode.js 존재 · `m3-shadow-hookup.json` resolvedValues.low.shadow {cascades:2, activeCascades:1, mapSize:1024, maxDistance:80} · 로드맵 M3-10(미체크)·M4-03/04 완료 조건 "CSM2×1024²" | 설계 (구조) + 체크 (M3-10·M4-03·M4-04 조건 문구) |
| 7 | 계획서 | §4-1 예산표 "삼각형 ≤600K … 지형 131K + 수목 120K + 마을 32K + 인스턴스", §3-6 "풀 6,000 × 25m", §3-3 "클럼프 8~16 tris × 6,000" | 인스턴스 tris 를 암묵적으로 ≤~300K 로 가정 | **실측**: Kenney grass GLB LOD0 = **132 tris/인스턴스**(계획 8~16 의 8~16배) → low worst **816,434**(식생 81%, 예산 초과 216K) / base 2,384,834. 절차적 저폴리 풀 `grassLite`(12 tris) 적용 시 low **312,434 PASS**(식생 51%), base 704,834(여전히 FAIL). 정정안: ① §3-3 풀 행에 "GLB 132 tris → 절차적 12 tris(`grassLiteGeometry.ts`) 로 대체" ② §4-1 근거 열을 실측 구성(지형 131,072 · 식생 160,800 · 바위 17,200 · 수목 2,416 · 마을 468 · 길 478)으로 ③ base 예산 ≤1.1M 은 704K 로 통과하나 "grassLite 전제" 명기 | `Docs/perf/m4-scene-tris.json`(현재 파일 = `--grass-lite` 결과: low 312,434 pass / base 704,834 fail; baseline 수치는 커밋 `cab01cc` 메시지·`Docs/qa/m4-grass-lite.md` "816,434 tris, 216,434 초과") · `check-budgets.mjs` tris | 설계 (값·전제) — R60-C 판정(grassLite ADOPT 여부)에 종속 |
| 8 | 계획서 | §4-1 "수목 120K", §3-3 HeroTree "≤120K tris" | ≤120K | 실측 **2,416 (LOD0) / 718 (LOD1)** — 절차적 생성. 예산 열은 "≤120K(상한) · 실측 2,416" 병기 | `Docs/qa/m2-herotree.json` · `roadmap-evidence-map.md` #10·11 · `m4-scene-tris.json` heroTree 2416 | 없음 (근거 갱신) |
| 9 | 로드맵 | M2-31 "30초 이동 검증 … 3회 자동 재생" 완료 조건 "route hash 동일, stuck·낙하·관통 0" | 브라우저 자동 재생으로 읽힘 | 완료일 열의 "(Node 시뮬 3회)" 를 **조치 열에도 병기**: "Node 결정론 시뮬(dt 1/144·1/60·1/30) — 실제 Player 컨트롤러·heightmap 사용, 브라우저 재생 아님". `validateBenchRoute`(60초·5키프레임 고정)가 30초 역방향 구간을 못 실어 브라우저 재생이 불가했던 사유 병기 | `Docs/qa/m2-route.csv` hash `m2-route-v1-8a4ca5fd` 3회 동일 · todo R22-A · handoff ③-5 | 체크 (표기) |
| 10 | 계획서 | §6-4 "고정 캡처 3지점" 표 | S1 "마을 반대편 능선" / S2 "마을 입구" / S3 "거대 수목 뿌리 아래에서 올려다봄 → L4" | 실제 vista: **S1 = vista-mid (18,−60)→수목**(L1~L3) / **S2 = vista-start (0,26)→수목**(L5 **+ L4 실루엣**) / **S3 = vista-village (36.3,−91.3)→마을 (0,8)**(L5 지붕 대비). S3 는 수목 밑동에서 **마을 쪽**을 보므로 수목이 프레임 밖 → L4 는 S2 로 판정한다. 좌표 정정: vista-village 초안 (38,−96)=줄기 중심 → **(36.3,−91.3)**(중심에서 마을 방향 5m, 교차검증 규칙 "거리 ≤6m") | `src/data/vistas.json`(note 포함) · `l1-l5-decision.json` rule "L4 = S3 흑백 육안 — S3 는 수목이 프레임 밖이라 S2 실루엣으로 판정" · `Docs/qa/m2-vista3-houses.json` · `m3-l4-s3.json` shot 항목 | 설계 (측정 규약 표기) |
| 11 | 계획서 | §6-4 파일명 규약 `YYYYMMDD-<샷>-<before\|after>-<변경명>.png`, 절차의 `?shot=S1` | 날짜 접두 파일명·`?shot=S1` | 실제 규약: `Docs/lookdev/m3-{before,after}-{1,2,3}.png`(1=S2 vista-start, 2=S1 vista-mid, 3=S3 vista-village) + `-metrics.json`, 쿼리는 `?shot=<vista id>`(`vista-mid` 등). 번호↔샷 대응표를 §6-4 에 명기(R52-A 에서 master 지시가 after-2 를 S2 로 오인한 사례) | `Docs/lookdev/m3-after-*.png` · `m3-tonemap.md` "S1 = -2" · `l1-l5-decision.json` evidence 경로 | 체크 (표기) — `data/lookdev-shots.json`→`vistas.json` 은 이미 정정됨(2026-08-26) |
| 12 | 계획서 | §3-4 팔로우 카메라 "피치 −12°" | −12° | **−4°** (R48-A master 결정, M3-16: 시작 화면에서 수목 t=0 노출 — −12° 는 수관이 프레임 위로 잘려 5초 내 미노출) | `src/player/FollowCamera.tsx` pitchDeg −4 · `Docs/lookdev/first-5s.md` · 로드맵 M3-16 완료일 | 설계 (값) |
| 13 | 계획서 | §6-2 팔레트 "초원 #4B4A33 (S18%)", 지붕 "#7A4A32 (S41%, 상한 30~38%)" | 시작값 그대로 | 채택값: 초원 **#504B2B**(S30% — Neutral 톤매퍼 채도 25~27% 에서 L1 근경 30~36 도달에 필요) · 길 #6F674A · 식생 #3B3E26/#5C5834/#363A25 · 지붕 A/B/C **#744839/#744F39/#745639**(계산 S41.9% 의 #7A4A32 는 자체 상한 30~38% 초과 — `palette.md` 지적). "시작값" 열 옆에 "채택값(M3-19)" 열 추가 | `l1-l5-decision.json` settings.palette · `Docs/style-bible/palette.md` L20 · 로드맵 M3-06/07/08 완료일 | 설계 (값) |
| 14 | 계획서 | §6-2 하늘 표(drei `<Sky>` Preetham turbidity 8 / rayleigh 1.5 …), §3-3 SkyDome "drei `<Sky>` + HDRI IBL" | Preetham 파라미터 | 실제: **HDRI(`/env/sky_1k.hdr`) 배경 + `scene.backgroundNode` 안개색 접합 hazeMix 0.4 + backgroundIntensity 1.75 / environmentIntensity 1.0**. Preetham `<Sky>` 미사용 → 표를 HDRI 파라미터로 교체. S3 하늘 166(>145)은 방위 가중 `hazeDirection`(wt/loading, 기본 off) 후보 — R60-C 판정 대기 | `src/data/lookdev.json` skyTexture·sky · `src/scene/SkyDome.tsx` · `l1-l5-decision.json` backgroundIntensity 1.75·skyHazeMix 0.4 · `Docs/lookdev/m3-s3-attempt.md` | 설계 (구조) |

**영향 분류 집계** (14건): 설계 **11**(값 #1·2·3·4·7·12·13 = 7, 구조·규약 #5·6·10·14 = 4) · 체크 **2**(#9·#11; #6 은 설계+체크 겸함) · 없음 **1**(#8). 우선순위 상위 3건 = **#6(CSM 비호환 — 로드맵 M3-10·M4-03/04 완료 조건이 현재 표기로는 달성 불가)**, **#7(tris 예산 전제 — grassLite 채택 여부와 base 예산 판정 직결)**, **#3+#4(톤매퍼·노출 — §9 미확정표 8번 해소, 룩 채택값의 뿌리)**.

**추가로 발견했으나 후보에서 뺀 것**: `로드맵.md:87` M0b-20 절차의 `programs≤20` 잔존(→ 40) — `Docs/qa/consistency-review.md` §3 이 이미 보고. M3-08 산출물 열 `src/shaders/heroTree.ts` 는 실제 `src/scene/hero/heroTreeGeometry.ts`(정점색) — `roadmap-evidence-map.md` 규칙(절차적 대체 시 산출물 열 정정)과 같은 부류.

## 2. R60-C 결과가 ADOPT 일 때 기본값 반영 절차 (master 승인 후)

R60-C(codex-A, main GPU) 는 `lookdev-variants.mjs` 6 변형(baseline / hazeDir / heroContrast / vistaPitch / grassLite / combo) 을 판정한다. 결과표 `Docs/lookdev/variants/variants-result.md` 의 **ADOPT 후보** 행만 아래 diff 로 올린다. 판정은 "baseline 자동 PASS 합계를 줄이지 않고 목표 만족" 이므로 ADOPT 행은 L1~L3·L5 회귀가 없다는 뜻이다.

### 2-1. `src/data/lookdev.json` diff 초안 (키·값)

```diff
 "heroContrast": {
-  "enabled": false,
-  "trunkLumaScale": 1,
-  "canopyLumaScale": 1,
+  "enabled": true,            // heroContrast 또는 combo ADOPT 시
+  "trunkLumaScale": 0.75,     // 러너 쿼리 heroTrunk=0.75 (R54-A K1). 결과표의 L4 Δ 를 note 에 기록
+  "canopyLumaScale": 1.1,     // heroCanopy=1.1
 }
 "grassLite": {
-  "enabled": false,
+  "enabled": true,            // grassLite 또는 combo ADOPT 시 (low worst 312,434 ≤600K)
 }
 "sky": { "hazeDirection": {
-  "enabled": false,
+  "enabled": true,            // hazeDir 또는 combo ADOPT 시 (S3 far ≤145 실측값 기록)
 } }
```

`src/data/vistas.json` (vistaPitch ADOPT 시):
```diff
 { "id": "vista-mid", …,
+  "pitchDeg": 22.1,           // R52-A 후보 B. 결과표 s1.treeBboxTop 값(>0) 을 note 에
 }
```

- 세 스위치의 쿼리 우선 규칙(`?heroContrast=0`·`?grassLite=0`·`?hazeDir=0` 강제 off, `?vistaPitch=`)은 그대로 두어 before/after 재캡처가 가능하게 한다.
- **테스트 갱신이 반드시 따라온다**: `Automation/test-hero-contrast.mjs` "기본 off 불변" 절(enabled=false·배율 1.0 단언) → 채택값 단언으로. `test-grass-lite.mjs`(codex)·`test-haze-direction.mjs` 의 기본값 단언도 동일. 갱신 없이 값만 바꾸면 테스트가 실패해 M4-16 빌드 게이트를 막는다.
- 채택값을 넣은 뒤 `node Automation/lookdev-variants.mjs --variants default --out-dir Docs/lookdev/variants-adopted` 를 1회 더 돌려 **baseline(=새 기본값) 행이 이전 ADOPT 행과 같은 수치인지** 확인한다(쿼리 경로와 기본값 경로가 같은 코드를 타는지의 증거).

### 2-2. 그때 갱신할 문서

| 문서 | 갱신 내용 |
|---|---|
| `Docs/lookdev/l1-l5-decision.json` | `settings` 에 heroContrast/grassLite/hazeDirection/pitchDeg 채택값 추가 · `L4.checks` 의 줄기 vs 수관 Δ 를 실측값(≥10)으로 교체하고 `result` 를 수동 PASS → 자동 PASS 로 · S3 far 휘도(L3 `allShots.S3`) 갱신 · `evidence` 를 `Docs/lookdev/variants/lv-<variant>-S*.png` 로 · `at` 갱신 |
| `Docs/decisions/m3-gate.md` | "룩 추가 조건" 절 뒤에 **부록: 룩 변형 채택(R60-C)** — 결과표 링크·ADOPT/REJECT 행·채택 diff 요약·재캡처(2-1 마지막 단계) 수치. master 판정 절의 L4 "형태로 구분(수동)" 항목을 Δ 실측으로 대체 |
| `로드맵.md` | M3-05C/05D 완료일에 "(hueStrength 0.97 · lumaGain 0.34)" 유지 + **M3-06(초원 색)·M3-08(수목 재질) 완료일에 "R60-C 채택값 반영 <날짜>" 병기**(heroContrast 는 M3-08 의 줄기/수관 색을 바꾼다) · M3-09 L4 조건 "3체크" 를 Δ 수치로 · M3-10 은 §1 #6 정정과 함께 "단일 프러스텀 폴백" 조건으로 체크 가능 여부 재판정 · M4-14 tris 조건 옆에 grassLite 전제 명기 |
| `계획서.md` | §1 #1·2·3·4·7·12·13·14 를 적용(§6-2 채택값 열, §4-1 실측 구성) · §9 미확정표 8번(톤매퍼) "확정" · §6-4 에 변형 러너 1줄(`lookdev-variants.mjs`) 추가 |
| `Docs/lookdev/l4-contrast-plan.md`·`vista-pitch-candidates.md`·`variants-plan.md` | 머리에 "채택됨 <날짜>, 결과표 링크" 1줄 |
| `state/SESSION_STATE.md` | 채택 결정·수치 요약 |

### 2-3. REJECT 인 변형의 처리
- 값·스위치는 **그대로 둔다**(기본 off 이므로 화면 불변). 결과표의 수치를 `l4-contrast-plan.md` / `vista-pitch-candidates.md` / `m3-hazedir-design.md` 말미에 "실측 REJECT: <사유 수치>" 로 남기고, 다음 후보(heroContrast 는 K2 0.80/1.15, vistaPitch 는 A′ 21.7°)로 재실행 여부는 master 결정.
- REJECT 사유가 "자동 PASS 합계 감소" 면 어느 샷·어느 L 이 깨졌는지 `variants-result.json` rows[].metrics 로 확인한 뒤 후보 재계산.

## 3. 2026-08-27 추가 후보

> R75~R101 이후 실측으로 추가한 **후보 5건**이다. 기존 14건과 마찬가지로 이 표 자체는 `계획서.md`를 바꾸지 않으며, 영하님 승인 후 master가 본문과 §10 정정 이력을 함께 갱신한다. 기준 HEAD `5e54142`.

| # | 문서 | 절 | 현재 표기 | 정정 후보 | 근거 파일 · 실측 | 영향·상태 |
|---:|---|---|---|---|---|---|
| 15 | 계획서 | §4-1 programs 정의 | `programs.length ≤40`, “머티리얼 종류 상한” | **제안 A**: WebGPU render pipelines `≤48`을 주 게이트로 바꾸고 `programs≤72`·재질 객체≤16·그림자 캐스터 그룹≤8은 보조 경보로 기록 | `Docs/qa/m5-programs.json`: R91 programs 55 = vertex 36 + fragment 19, pipelines 36, 재질 12. `Docs/perf/m5-bench-r100.csv`: programs 62·avg 123.16·1%low 22.22. `Docs/decisions/programs-budget-proposal.md`: A/B/C 비교 | 설계(정의). **영하님 결정 대기** |
| 16 | 계획서 | §3-6 HeroTree LOD | core/detail 전략과 §3-2는 HeroTree 2단 LOD를 전제하나 품질표에 실제 GLB 전환값 없음 | `hero_tree.glb`가 있으면 `HERO_GLTF_LOD_SWITCH_METERS=400`으로 고정해 월드 대각 353m 안에서는 **항상 GLB**; `?lookAssets=0` 절차 폴백만 기존 placement LOD를 사용한다고 명기 | `Docs/decisions/hero-tree-footprint-r100.md` #4; `src/scene/HeroTree.tsx`; R100 low 추정 tris 약 390K≤600K | 설계(LOD). R100 적용값을 본문으로 승격 |
| 17 | 계획서 | §3-4 충돌·동선 | 캐릭터/카메라 충돌만 있고 거대 수목 발자국과 bench 접근 정지 거리 없음 | HeroTree 충돌 반경 **8.0m**, final route 접근 정지 목표 **9.5m**를 데이터 계약으로 추가 | `Docs/decisions/hero-tree-footprint-r100.md` #1~2: 브라우저 최종 편차 0.30m·밑동 9.21m·hero/village 관통 0, route hash `a9f1339c4187` | 설계(값). R100 적용값을 본문으로 승격 |
| 18 | 계획서 | §6-4 자산 밀도 | §10 #6의 “수목 실루엣 경계 픽셀 비율”은 구현상 `boundaryPixels / maskPixels`; 큰 꽉 찬 수관일수록 분모가 커져 형태가 좋아져도 점수가 내려감 | **대안 1개**: `heroContourPerHeight = boundaryPixels / (maskBbox.bottom - maskBbox.top)`로 바꾸고 M3·M5 캡처를 같은 식으로 재산출해 목표를 다시 고정. 면적 대신 화면 높이로 정규화해 크기와 윤곽 복잡도를 분리 | `Docs/lookdev/m5-density-after-r100.json`: boundary 1,116px, bbox top 89/bottom 302 → 후보값 `1116/213 = 5.239`; 현 `heroSilhouetteRatio=0.03354`는 판정 보류 | 설계(측정 규약). **영하님 결정 대기**, 기존 임계값 이관 금지 |
| 19 | 계획서 | §3-1 폴더 구조 | 본문 트리에 `public/ui/`, `src/game/`, `src/scene/fx/`가 없고 `src/shaders/`만 있음 | §10 #1에서 이미 적용한 네 경로를 본문 트리에 반영: `public/ui/`, `src/game/{data,rules,world,mobs}`, `src/scene/fx/`, `src/shaders/` | `계획서.md` §10 #1; 실제 `public/ui/`, `src/game/`, `src/scene/` 존재; `Docs/qa/roadmap-evidence-map-m5m6.md` M6-04~36 | 없음(문구·구조도 정합). §10 반영 완료, 본문 동기화만 남음 |

### 3-1. 적용 순서

1. 영하님이 #15와 #18의 측정 정의를 먼저 결정한다. 숫자 게이트가 정해져야 M5-14/M6-37을 같은 규약으로 잴 수 있다.
2. #16·#17은 R100 적용값을 본문과 품질/동선 데이터 설명에 승격한다.
3. #19는 §10 #1과 실제 폴더를 본문 트리에 복사하는 문서 정합 작업이다.
4. 적용 뒤 `로드맵.md` M5-13·14, M6-01·37 완료 조건도 같은 용어(`pipelines`, `heroContourPerHeight`)로 맞춘다.
