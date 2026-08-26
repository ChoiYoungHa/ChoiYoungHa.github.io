# R114-A 품질 상향 1차 — `base` 실측 · D5 돼지 · D6 카메라 · pipelines 절감

- 2026-08-27 worker-claude `4e4ecd5b`, main `95bbf83`(wt/loading R110-B·R111-B, wt/bench R112-A 병합), actual build, 헤드리스 Chrome WebGPU. 영하님 결정: "컴퓨팅 자원을 더 써도 된다, 완성도 50~60%".
- 원본: `Docs/perf/m5-bench-base-r114.csv`, `Docs/qa/m5-budgets-base-r114.json`(입력 `m5-gate-perf-base-r114.json`), `Docs/qa/m6-r114/`(game run json·PNG, `d5/` 프로브 9장, `pipe/`), `Docs/lookdev/m6-r114-{jump,prompt,skillfx,levelup}.png`
- 코드 변경: `Automation/run-bench.mjs`(`--preset low|base`, 기본 low 불변)·`test-bench-args.mjs`(기대값 +preset) · `src/player/cameraCollision.ts`(신설, 순수)·`Automation/test-camera-collision.mjs`(8/8) · `src/player/FollowCamera.tsx`(게이트 안에서만 캐스트) · `src/scene/GameRuntime.tsx`(PIG_TINT·단구 바위 castShadow off) · `src/scene/RockInstances.tsx`(castShadow off) · `Automation/game-walk.mjs`(`--q`, pipelines 타임라인, 병합분 캡처). 커밋 없음.

## 1. `base` 프리셋 관문 실측 (`?route=bench&q=base`, warmup 30, 60s ×3)

| run | avg fps | 1% low | hitch 1s | calls | programs | 텍스처 GPU MB | JS heap MB |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 131.69 | 22.31 | 0 | 63 | 62 | 101.8 | 158.9 |
| 2 | 119.44 | 8.68 | 1 | 51 | 66 | 101.8 | 241.9 |
| 3 | 130.17 | 23.77 | 0 | 63 | 62 | 101.8 | 270.6 |
| **median** | **130.17** | **22.31** | 0 | 63 | 62 | 101.8 | 241.9 |

- 관문: avg ≥30 PASS · 1%low ≥20 **PASS(22.3, 여유 2.3)** · hitch ≤2 PASS(2회차 1) · pipelines(bench 동선 peak, 절감 후) **45 ≤48 PASS** · `check-budgets --preset base` **pass**(calls 63/350·tris 704,834/1.1M·텍스처 101.8/550·heap 241.9/1200, programs 62 참고값).
- base 는 텍스처 2K 티어(71.9→101.8MB)·스테이지 1600×900(dprCap 1)이라 1280×720 창에서는 캔버스가 창을 넘어 DOM 우측이 잘린다(캡처 `m6-s05-shop-r114.png`) — 프리셋 정의상 정상이나 실기 창 크기 확인 필요.
- `?game=1&q=base` 사냥 중 60초(rAF, 10처치): **avg 112.7 · 1%low 28.9 · hitch 0 · programs 83 · pipelines 60 · info.textures 26 · heap 104MB** (R109 low: 135.8/48.1/pipelines 56). 절감 전 값.

## 2. D5 — 돼지 근접 시 검은 덩어리 (수정 완료)

- 원인 실측(`Docs/qa/m6-r114/d5/`): 플레이어 옆 1.6m 에 돼지 InstancedMesh 클론을 두고 A/B — receiveShadow off·castShadow off·법선 재계산·plain 재질(wobble positionNode 제거)·flatShading **모두 변화 없음**. `mob_pig.glb` 는 텍스처 0·baseColor 없음·**COLOR_0 평균 linear(0.233,0.196,0.231) = sRGB(132,121,131) 회보라** → 노출 0.44 아래서 검게 보임. 원거리 "분홍"은 안개 틴트.
- 수정: `GameRuntime.tsx` `PIG_TINT '#f2a7bd' × PIG_TINT_GAIN 3.0` 을 재질 color 에 곱함(정점색 디테일 유지). A/B: gain 2 어두움(`d5-6`), **gain 3 판독 가능(`d5-8`)**, 정점색 off+분홍(`d5-7`)은 디테일 손실.
- 전/후: `d5-0-original.png`(회흑) → `d5-8-tint-pink-gain3.png` / 게임 내 `Docs/lookdev/m6-r114-skillfx.png`(근접·원거리 모두 분홍).

## 3. D6 — 마야 앞 카메라 지붕 관통 (수정 완료)

- `src/player/cameraCollision.ts`: 플레이어→카메라 XZ 선분을 마을 회전 박스(`VILLAGE_COLLIDERS`)·거대 수목 원에 slab/원 교차로 캐스트, margin 0.35m, **최소 1.5m**. `FollowCamera.tsx` 는 `GAME_INPUT_ENABLED && intro 아님` 일 때만 `back` 을 줄인다(높이 유지).
- 테스트 8/8(축정렬·45° 회전·내부→min·min 미만 요청·원·스침·실제 village-02 케이스).
- 브라우저: `m6-s05-shop-r114.png` 마야 앞에서 카메라가 지붕 안으로 안 들어감(R109 run1 은 지붕 면으로 화면 전체가 덮임). 아치는 콜라이더가 없어(D2) 캐스트 대상 아님.
- 기본 경로 비트 동일: `?route=final` 편차 **0.331m**(≤1.5, R109 0.313)·최대 waypoint 1.447m·hash `a9f1339c4187`·ungrounded 0 · `?route=bench` low 는 R108 대비 변경 없음(게이트 밖 코드 경로 미실행).

## 4. 사냥 중 pipelines 60 → 절감

pipelines 는 첫 렌더 시 생성·캐시되므로 씬 진행 타임라인으로 분해했다(`?game=1&q=base`, 절감 전):

| 시점 | pipelines | Δ | 귀속(추정) |
|---|---:|---:|---|
| S00 타이틀(런타임 마운트, 돼지·NPC·석상·단구 바위 로드) | 48 | — | 기본 씬 + 게임 오브젝트 그림자 패스 일부 |
| S01 생성 화면(월드 첫 전체 렌더) | 58 | **+10** | 돼지 wobble(main+shadow)·NPC GLB 2종·단구 바위·석상·드롭 빌보드의 main/shadow 변형 |
| S05 상점(드롭·인벤 아이콘 등장) | 60 | +2 | 드롭 빌보드(vertexColors+alphaTest depth) |
| 스킬 2 입력 후 / 레벨업 링 후 | 60 / 60 | 0 / 0 | SkillFx·LevelUpRing 은 공유 fx 재질 — 추가 0 |

적용 조합(룩 손실 최소): **산재 바위 `RockInstances` castShadow off + 단구 바위 castShadow off**(R91 절감안 "rock castShadow off ≈ −7" 중 rock 부분).

| 측정 | 절감 전 | 절감 후 | Δ |
|---|---:|---:|---:|
| `?route=bench&q=base` peak(게임 없음) | — | **45** | (low R108 48 → 제안 A 안) |
| `?game=1` 숲 진입(base / low) | 58 / — | **54 / 53** | −4 |
| `?game=1` 사냥 중(추정 = 숲 +2) | 60 | ≈56 | −4 |

**48 이하 미달**(≈56). 강행하지 않은 남은 후보와 예상치: ① 돼지 castShadow off(−2, wobble shadow 변형 제거) ② NPC 2종 castShadow off(−2~4) ③ 드롭 빌보드 castShadow 없음·alphaTest depth 변형 제거(−1~2) ④ rock 지오메트리 병합(R91 −4, 코드 변경 큼) ⑤ 석상 clone castShadow(현재 GLB 기본값). 룩 손실 순서로 ①②→④ 권장.

## 5. 병합분 브라우저 확인 (`?game=1&q=base`, 콘솔 error 0)

| 항목 | 결과 | 캡처 |
|---|---|---|
| 스킬 `2` → SkillFx | 입력·처치 정상, 궤적은 작아 firstKill 대화와 겹쳐 뚜렷하지 않음 | `Docs/lookdev/m6-r114-skillfx.png` |
| 레벨업 링(완료 click 직후) | 보상 팝업과 동시 표시, pipelines +0 | `m6-r114-levelup.png` |
| 점프(Space 직후 공중) | 캡처 존재(플레이어 박스 상승) | `m6-r114-jump.png` |
| InteractPrompt | 스탄 2m 앞에서 DOM `data-interact-prompt` = **"F 대화"** | `m6-r114-prompt.png` |
| S00~S10 전체 | 전부 PASS(S03·S04·S05 의 FAIL 표기는 스크립트 판정 문자열 — 배너 4s 만료·own IP 명칭·자동구매 D3) | `Docs/qa/m6-r114/m6-s*-r114.png` |

## 6. 잔존

- pipelines ≈56 > 48 — 위 후보 ①②④ 미적용(강행 금지 지침).
- base 1%low 22.3 은 여유 2.3, 2회차 8.68(hitch 1)은 워밍업 직후 편차.
- SkillFx 시각 확인은 정지 캡처 1장으로는 불충분 — 연속 캡처 필요.
- 회귀: camera-collision 8·colliders 22·bench-args 14·final-route 15·village 6·run-story 3·game-integration 4 전부 PASS, tsc 0. 포트·헤드리스 Chrome 0.
