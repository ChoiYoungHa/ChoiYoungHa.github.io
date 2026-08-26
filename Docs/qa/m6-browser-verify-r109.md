# M6 통합 브라우저 검증 (R109-A) — `?game=1` 씬 S00~S10 · 기본 경로 비트 동일 · 결함 목록

- 작성 2026-08-27 R109-A(worker-claude `4e4ecd5b`, main) / HEAD `eed0e25`(wt/loading R107-B 병합) / actual build(`build.ps1` exit 0) / 헤드리스 Chrome WebGPU 1280×720 `low`
- 러너: 신설 `Automation/game-walk.mjs`(모드 `baseline`·`final`·`game`; CDP 키 이벤트 주입·DOM 버튼 click·씬 그래프 읽기). 원본 JSON·PNG: `Docs/qa/m6-r109/`(`run1`~`run3` 는 스크립트 보정 전 실행, 최종은 `run4`)
- 게임 코드는 수정하지 않았다(검증 범위). 스크립트 갭으로 실패한 항목은 게임 결함과 구분해 적었다.

## 1. 기본 경로 비트 동일 (게이트 OFF)

| URL | `[data-game-overlay]` | `m6-game-runtime` | game lazy 청크 요청 | JS 요청 | 콘솔 error | 결과 |
|---|---|---|---|---|---|---|
| `/?q=low` | 없음 | 없음 | 0 (`GameRuntime-*.js`·`GameOverlay-*.js/css` 미요청) | 3 | 0 | PASS |
| `/?q=low&route=bench` | 없음 | 없음 | 0 | 3 | 1 = `m0b-intentional-rejection`(bench 하네스 의도 예외, R108과 동일) | PASS |
| `/?q=low&route=final` | 없음 | — | 0 | — | 1(동일 의도 예외) | **편차 0.313m**(R100 0.30m, 한도 1.5m) · 최대 waypoint 편차 1.447m(fit 한도 2m) · routeHash `a9f1339c4187` · integratedSeconds 75.001 · ungrounded 0 → PASS |
| `/?q=low&route=bench` bench 1회(warmup 30) | — | — | — | — | — | §5 표 (R108 중앙값과 비교) |

`?game=1` 에서만 `GameOverlay-C7lIsbzJ.js`·`GameOverlay-C-eSCVzX.css`·`GameRuntime-BDkBr-u0.js` 3개가 추가 요청된다.

## 2. `?game=1` 씬별 결과 (run4 = 최종)

| 씬 | 검증 내용 | 결과 | 캡처 |
|---|---|---|---|
| S00 타이틀 | 로딩 100% 후 "시작하기" 활성, RENDERER WebGPU·PRESET low 표시 | PASS | `m6-s00-title-r109.png` |
| S01 생성 | Enter edge → create(run2·3·4 PASS, run1은 8s 내 미반응 → 버튼 click로 진행), 직업 기본 궁수, "랜덤" 초상 순환 | PASS(Enter 간헐) | `m6-s01-create-r109.png` |
| S02 힌트 | 생성 확정 → forest, HUD Lv.1 영하 160/160, W·Shift+W·Space 3입력 주입, 힌트 DOM 표시 | PASS | `m6-s02-hints-r109.png` |
| S03 아치 | 게이트 AABB 진입 시 "마을로 진입합니다 · 버섯마을" 배너, 카메라 0s→2s 원거리화(6→9m) 육안 확인 | PASS | `m6-s03-gate-0s/2s-r109.png` |
| S04 스탄 | F → "NPC 촌장 오릭" 대화(own IP 명칭) → 수락 click → 퀘스트 HUD "돼지 0/10" | PASS | `m6-s04-stan-r109.png` |
| S05 마야 | F → 대화 → Enter 통과 시 scene `shop` 에서 **선택 없이 직업 무기 자동 구매**(코인 1,500→600) → 패널은 잔액 600 기준 "코인 부족"·구매 비활성 표시 | PASS(구매 성공) + 결함 D3 | `m6-s05-shop-r109.png` |
| S06 공원 | 서쪽 40m 이동 → "분홍갈기 공원" 배너, 돼지 8마리(≤10) HP바 투영 | PASS | `m6-s06-park-r109.png` |
| S07 사냥 | 규칙 규약 yaw 로 조준 시 1(공격)·2(스킬) 로 **10/10 처치**, HP바 투영, firstKill 대화 1회 통과, 드롭 빌보드는 run2·3 에서 관측(`run3/m6-s07-drop-r109.png`; run4 는 근접 자동 수집으로 미캡처). DOM 플로터 `[data-damage-floater]` 셀렉터 0(마크업 미확인, 화면엔 "20" 숫자 표시) | PASS(이동 규약 yaw 로는 FAIL → D1) | `m6-s07-hunt-r109.png`·`m6-s07-drop-r109.png` |
| S09 완료·보상 | 스탄 F → "완료" click → "LEVEL UP · 보상 획득 · 코인 3,000 · 경험치 +250 · 분홍 리본(장식)" 팝업 | PASS + 결함 D12 | `m6-s09-reward-r109.png` |
| S10 에필로그 | 나레이션("돼지 열 마리…", "다음 예고 — 서쪽 절벽 너머…") + "다시 하기"·"자유 탐험" 버튼 | PASS | `m6-s10-epilogue-r109.png` |

### 2-1. 사냥(S07) 조준 실험 — 결함 D1 근거

같은 돼지(거리 ≤1.6m)를 두 yaw 규약으로 조준해 기본 공격 3회씩:

| yaw 규약 | 전방 벡터 | 결과(run2) | 결과(run3) |
|---|---|---|---|
| 이동 규약(컨트롤러 `raycast.ts`: `wishX = -sin(yaw)`) | (−sin, −cos) | 처치 0, 플로터 0 | 처치 0 |
| 규칙 규약(`combat.ts:78`·`interact.ts:25`: `forwardX = +sin(yaw)`) | (+sin, −cos) | **처치 1/10** | **처치 1/10** |

세션은 `GameRuntime.tsx` 에서 카메라 시선으로 `playerYaw = atan2(-view.x, -view.z)` 를 넘기며 이는 컨트롤러 yaw 와 같다. 따라서 플레이어가 **화면 정면으로 보는 돼지는 x 축이 반전된 원뿔에서만 맞는다**(z 축 정렬 시에만 우연히 일치). NPC 상호작용도 같은 부호를 쓰지만 스탄·마야는 z 방향 접근이라 실험에서는 통과했다.

## 3. 결함 목록

| # | 심각도 | 결함 | 재현 | 근거 캡처/JSON |
|---|---|---|---|---|
| D1 | **높음(진행 차단)** | 전투·상호작용 원뿔의 전방 x 부호가 컨트롤러 이동 규약과 반대(`combat.ts:78`, `interact.ts:25` `+sin` vs `raycast.ts:56` `-sin`). 정면 조준으로 처치 불가 | `?game=1` 공원에서 돼지를 정면에 두고 1 → 미스; x 반전 yaw → 처치 | §2-1, `run2/m6-game-r109.json` `aimExperiment` |
| D2 | 높음 | 마을 아치가 **닫힌 성문 메시**인데 충돌 없이 관통 진입(게이트 z 19.8 통과 시 플레이어가 문 안쪽으로 사라짐) | S03 진입 | `run2/m6-s03-gate-0s-r109.png` |
| D3 | 중간 | 상점 scene 에서 Enter(confirm)가 패널 없이 직업 무기를 즉시 구매(`session.ts:510` 기본 무기 fallback). 마야 대화 마지막 Enter 가 연타되면 의도 없이 구매됨 | 마야 대화 Enter 연타 | `run1/m6-s05-shop-r109.png`(잔액 600·"코인 부족") |
| D4 | 중간 | 게임 HUD 스탯 패널이 디버그 런타임 HUD(`runtime-hud`) 위에 겹침(좌상단), 상점·대화 중에도 디버그 HUD 노출 | 모든 씬 | `run1/m6-s07-hunt-r109.png` |
| D5 | 중간 | 돼지 GLB 근접 시 검은 덩어리로 렌더(재질·텍스처 미적용 의심; 원거리 S06 에서는 분홍) | 공원 근접 | `run1/m6-s07-hunt-r109.png` |
| D6 | 중간 | 마야 앞(house-b 3m)에서 카메라가 집 지붕 내부로 들어가 화면이 붉은 지붕 면으로 덮임(카메라 충돌 없음) | S05 | `run1/m6-s05-shop-r109.png` |
| D7 | 낮음 | 타이틀에서 Enter confirm 이 로딩 직후 1회 미반응(run1), 이후 실행에서는 정상 — `GameRuntime` Suspense(useGLTF) 완료 전 edge 소실 가능성 | 로딩 직후 즉시 Enter | `run1` S01 note |
| D8 | 낮음 | 디버그 HUD `camera: dist 6m` 표기가 카메라 이징 배율(6→9m)을 반영하지 않음 | S03 2s | `run2/m6-s03-gate-2s-r109.png` |
| D9 | 낮음 | 돼지 8마리가 타이틀 화면 시점부터 공원 좌표(−80±12, 8±12)에 배치·렌더됨(스포너 초기 슬롯) — 시야 밖이라 시각 영향 없음 | 타이틀 | `run3/m6-game-r109.json` `pigsAtTitle` |
| D10 | 낮음 | 첫 처치 직후 firstKill 대화가 전투 중 열려 플레이어 입력을 막는 동안 돼지 공격은 계속(run1 HP 160→8) — 설계 확인 필요 | 첫 처치 | run1·run3 S07 hud |
| D12 | 중간 | 보상 팝업(LEVEL UP)과 에필로그 나레이션 "돼지 열 마리." 텍스트가 **동시에 겹쳐 표시**(퀘스트 완료 → 즉시 `epilogue` scene 진입, reward 가 닫히기 전) | S09 | `m6-s09-reward-r109.png` |
| D11 | 정보 | 카메라 이징·NPC 스케일(스탄 ≈ 플레이어 1.8m 대비 정상)·돼지 크기(PIG_SCALE 0.005, 원거리 정상)·배너 4s 는 육안 이상 없음 | — | run1 캡처 |

## 4. 최종 state (run4)

run4 `Docs/qa/m6-r109/m6-game-r109.json`: scene `epilogue`, quest 10/10(done), 보상 코인 +3,000(구매 후 600 → 3,600 추정, 에필로그에서 HUD 숨김이라 숫자 미표시)·경험치 +250·LEVEL UP 표시(run3 1처치 시점 Lv.2 확인), 플레이어 (−3.29, 4.51) 스탄 앞, 콘솔 error **0**, 캡처 11장(S00·S01·S02·S03×2·S04·S05·S06·S07·S09·S10).

## 5. 성능

| 측정 | avg fps | 1% low | hitch 1s | calls | programs | pipelines | 텍스처 | 비고 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| R108 `?route=bench` WebGPU 중앙값 | 125.37 | 30.74 | 0 | 63 | 62 | 48 | 71.87MB | 기준 |
| R109 `?route=bench` 1회(게이트 OFF, HEAD eed0e25) | 122.43(−2.3%) | 21.61(1회·워밍업 편차, R108 3회 범위 27.8~31.5 밖) | 0 | 63(0%) | 62(0%) | — | 71.87MB(0%) | avg·calls·programs·텍스처 ±3% 안 → 비트 동일. 1%low 는 1회 표본이라 판정 제외(`Docs/perf/m6-bench-r109-baseline.csv`) |
| `?game=1` 사냥 중 60초 rAF 샘플(run4, 10처치) | 135.80 | 48.08 | 0 | HUD 49~57 | 76 | **56** | info.textures 24 | M6-37 사전값(heap 90.6MB) |
| `?game=1` 사냥 중 60초(run3) | 136.53 | 71.43 | 0 | HUD 57 | 76 | 56 | 24 | programs 76(계획서 40·제안 A 보조 72 초과), **pipelines 56 > 제안 A 48** |
| `?game=1` 사냥 중 60초(run2) | 105.76 | 36.10 | 0 | — | 77 | 56 | 24 | 동일 조건 재현(편차는 돼지 근접 수) |

`?game=1` 은 렌더 파이프라인을 48→56(+8: 돼지 인스턴스·드롭 빌보드·NPC GLB·석상·단구 바위 + 그림자 패스)으로 늘려 **제안 A 기준을 초과**한다 — M6-37 관문에서 절감 대상.
