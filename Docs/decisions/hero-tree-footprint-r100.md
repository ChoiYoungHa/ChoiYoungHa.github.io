# 거대 수목(BigTree_3Donimus) 발자국 재정합 — R100-A (worker-claude, master 결정 적용)

main `f6fb59a` 기준. R96-A 결함 D1-2(밑동/뿌리 폭 ≈25×34m vs 충돌 반경 3.0m·route 정지점 3.02m·vista 5m) 해소.

| # | 항목 | 전 | 후 | 근거·파일 |
|---|---|---|---|---|
| 1 | 충돌 반경 | `HERO_TRUNK_RADIUS = 5.2/2 + 0.4 = 3.0` | `HERO_FOOTPRINT_RADIUS 7.6 + PLAYER_RADIUS 0.4 = 8.0` | master 결정(줄기 ≈3~4m + 안쪽 뿌리, 바깥 뿌리 ≤17m 통과 허용). `src/scene/colliders/heroTree.ts`, 접지·SKIN 불변. 테스트 `test-colliders.mjs` 8.0 갱신 |
| 2 | final route | 정지점 (36.966,−92.552) = 밑동 3.02m, hero-approach 43s, hash `6ad0996f1aff` | 정지점 (35.271,−86.9) = 같은 방위 **9.5m**, hero-approach **40.2s**(43s 이면 이동 거리 137m 그대로라 시뮬이 반경 8.0 에 눌려 8.0m 정지 → 41/40.5s 도 8.0/8.45 → 40.2s 에서 9.25m), `fit-final-route.mjs` MIN/MAX 3~6 → 9~10, 재적합 hash **`a9f1339c4187`** | 시뮬 최종 편차 0.25m·최대 1.47m·밑동 9.25m. 브라우저 재실주행(R74 절차, `Docs/qa/m4-final-route-run.json`, 이전 `-r74.json`): hash 일치·최종 편차 **0.30m**·밑동 **9.21m**·hero/village 관통 0·stuck 0·낙하 0·errors 0·적분 75.004s. 테스트 `test-final-route.mjs` hash·시각 배열·yaw 중간값(파일값 기반) 갱신 |
| 3 | vista | vista-village (36.3,−91.3) 5m / vista-start (0,26) 아치에 가림 | vista-village **(34.6,−86.6)** 같은 방위 10m / vista-start **(5.7,27.8)** 시선축 수직 +6m | `src/data/vistas.json`. `test-scatter.mjs`·`test-colliders.mjs` 거리 단언 8~12m. S2 캡처에 집·울타리·수목이 모두 든다 |
| 4 | LOD1 | placement `lodSwitchDistanceMeters` 90 → 90m 밖은 절차 수목(실루엣 불일치) | GLB 모드면 `HERO_GLTF_LOD_SWITCH_METERS = 400`(월드 대각 353m 밖) = 항상 GLB. `?lookAssets=0` 은 placement 값 | `src/scene/HeroTree.tsx`. tris 여유(low 추정 312K + GLB 35K + 집 ≈43K ≈ 390K ≤600K) |
| 5 | 뿌리 부유 | 원점 = bbox min y(뿌리 끝 이상치) | 원점 = 월드 정점 y **하위 2% 분위**(`HERO_ROOT_Y_PERCENTILE`) + **−0.5m 침하**(`HERO_ROOT_SINK_METERS`) | `HeroTree.tsx` + 순수 `percentileValue`(`lookAssets.ts`). S1 캡처 전(`m5-tree-after-r96.png`, 뿌리가 지면 위로 뜸) → 후(`m5-tree-after-r100.png`, 뿌리가 지면에 묻힘) |
| 6 | 잎 채도 | baseColor (0.07,0.44,0.08)/(0.27,0.55,0.07) 그대로 | 잎 재질 color = lerp(baseColor, 수관 팔레트 #3B3E26, **0.35**)(`HERO_LEAF_DESATURATE`, 선형) | `HeroTree.tsx`. S1 far 채도 14.4 → **14.0**(목표 ≤12 미달), L5 17.1 → 17.8(잎이 원경 밴드에 그대로 들어와 효과 작음 — 0.5~0.6 또는 원경 밴드에서 잎 비중 자체가 문제) |

## 캡처·판정 (WebGPU toDataURL, `Docs/lookdev/m5-variants-r100/`)
| 샷 | pass | near 채도/hue/휘도 | far 채도/hue/휘도 | L5 |
|---|---|---|---|---|
| S1 tree (`m5-tree-after-r100.png`) | 1/4 | 34 / 44.8° / 74.6 | 14.0 / 214° / 128.4 | 17.8 |
| S2 village (`m5-village-after-r100.png`) | 1/4 | **65.6** / 31.8° / 44.6 (주황 울타리·소품이 근경 지배) | 10.4 / 211° / 131.8 | 11.8 |
| S3 ground (`m5-ground-after-r100.png`, 수목 밖) | 1/4 | 38.2 / 35.8° / 70.3 | 10.5 / 212° / 166.6 | 16.7 |

밀도(`m5-density-after-r100.json`, S1): meshKinds 16 · heroSilhouetteRatio **0.0335**(mask 33,274px, 목표 ≥0.183 미달 — 큰 실루엣 덩어리 특성, 잎 카드형 수목이 아니면 도달 어려움).

bench 1회(warmup 30, `m5-bench-r100.csv`): avg 123.2 · 1%low 22.2 · hitch 0 · calls 63 · programs 62 · texGPU 71.9MB · crash 0.

## 남은 결함
- 집 GLB(KayKit) 스케일이 ≈1m 높이라 S2 에서 미니어처로 보임(bbox h 0.93~1.4 단위 × placement scale ≤1) — 스케일 ×4~5 또는 placement scale 재정의 필요(D4 후속).
- 소품(울타리 scale 3·현수막 부유) 채도 65% 로 S2 L1 near 이탈.
- 잎 채도 목표 미달(위 6).
- heroSilhouetteRatio 미달.
