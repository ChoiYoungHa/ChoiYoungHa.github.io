# M5·M6 로드맵 증거 맵

- 기준: `wt/bench@16b713b`, 2026-08-27
- 범위: `로드맵.md`의 M5-00~M5-15 16행, M6-01~M6-39 39행, 합계 **55행**
- 판정법: 아래 경로를 worktree에서 실제 `Test-Path -LiteralPath`로 검사했다. `있음 a/b`는 나열한 증거 b개 중 a개가 존재한다는 뜻이며, 디렉터리·glob 대신 대표 파일을 명시했다.
- 상태: **완료**는 핵심 구현·자동 증거가 있고 명시된 미충족 조건이 없는 행, **부분**은 일부 산출물 또는 검증만 있는 행, **미착수**는 해당 행의 핵심 구현/측정이 없는 행이다. 파일 존재와 완료 여부는 동일하지 않다.

## 요약

| 구간 | 완료 | 부분 | 미착수 | 합계 |
|---|---:|---:|---:|---:|
| M5 | 6 | 9 | 1 | 16 |
| M6 | 18 | 17 | 4 | 39 |
| **합계** | **24** | **26** | **5** | **55** |

## M5 증거 맵

| ID | 로드맵 행 | 증거 파일 경로 | 존재 여부 실측 | 상태 | 판정·남은 조건 |
|---|---|---|---|---|---|
| M5-00 | 규칙 정정 | `../계획서.md` | 있음 1/1 | 완료 | §10 정정 이력과 §4-1 알파·텍스처 기준 존재 |
| M5-01 | 수목·카드·PBR·HDRI 수집 | `DCC/incoming/assets-R75-A.csv`; `DCC/incoming/asset.hero.tree.a/License.txt`; `DCC/incoming/asset.sky.hdri.b/kloofendal_48d_partly_cloudy_puresky_2k.hdr` | 있음 3/3 | 완료 | 실물·라이선스·수집 CSV 존재; BirchTree_2는 후속 R96에서 retired |
| M5-02 | 집 3종·소품 수집 | `DCC/incoming/assets-R75-B.csv`; `DCC/incoming/asset.village.house.a/building_home_A_red.glb`; `DCC/incoming/asset.prop.arch.a/License.txt` | 있음 3/3 | 완료 | 집 3종과 소품 후보·라이선스 대장 보존 |
| M5-03 | 로딩 경로 4종 | `src/scene/HeroTree.tsx`; `src/scene/Village.tsx`; `src/scene/Foliage.tsx`; `src/scene/Terrain.tsx`; `Automation/test-asset-fallback.mjs` | 있음 4/5 | 부분 | 런타임 파일 경로는 있으나 계약에 적힌 fallback 전용 테스트가 없음 |
| M5-04 | Mixamo 다운로드 | `public/models/char_player.glb`; `DCC/incoming/asset.char.player.a/License.txt` | 있음 2/2 | 완료 | 변환 GLB와 사용 고지 존재; raw FBX는 배포 금지에 따라 worktree에 없음 |
| M5-05 | FBX→GLB 변환 | `Docs/decisions/fbx-to-glb.md`; `public/models/char_player.glb`; `Docs/qa/m5-char-glb.json` | 있음 3/3 | 부분 | 변환 성공, 그러나 player 35,194 tris·114 bones로 ≤18K·≤45 예산 실패 |
| M5-06 | 대장·라이선스 | `src/data/assets.csv`; `Docs/licenses/asset.hero.tree.a.txt`; `Automation/check-assets.mjs` | 있음 3/3 | 완료 | 현 대장 35행과 라이선스 사본·검사기 존재, R101에서 check-assets PASS 재확인 |
| M5-07 | 런타임 배치·페이로드 | `src/data/loading-manifest.json`; `Docs/perf/m4-payload.json`; `Automation/check-payload.mjs` | 있음 3/3 | 완료 | 최신 actual-build 총 13,352,594B, 모든 페이로드 검사 PASS |
| M5-08 | 수목 교체 실측 | `Docs/lookdev/m5-tree-before.png`; `Docs/lookdev/m5-tree-after-r96.png`; `Docs/perf/m5-scene-tris-low.json`; `Docs/qa/m5-tree.json` | 있음 3/4 | 부분 | Big Tree 교체·캡처·tris 증거는 있으나 계약명 `m5-tree.json`과 최종 관통/console 판정 없음 |
| M5-09 | 마을·소품 교체 | `src/data/placement.json`; `Docs/lookdev/m5-village-before.png`; `Docs/lookdev/m5-village-after-r96.png` | 있음 3/3 | 부분 | 배치·전후 캡처 존재, 집 8·소품 12·calls≤200의 한 문서 판정은 없음 |
| M5-10 | 지형·잔디 카드 | `Docs/lookdev/m5-ground-before.png`; `Docs/lookdev/m5-ground-after-r96.png`; `Docs/perf/m5-overdraw.csv` | 있음 2/3 | 부분 | 전후 캡처는 있으나 요구한 overdraw·1% low 비교표 없음 |
| M5-11 | 캐릭터·애니 블렌딩 | `public/models/char_player.glb`; `src/player/Player.tsx`; `src/player/animation.ts`; `Automation/test-animation.mjs` | 있음 1/4 | 미착수 | 자산만 있고 Player/AnimationMixer·블렌드 순수 함수·테스트가 없음 |
| M5-12 | 2K HDRI 비교 | `Docs/lookdev/m5-sky2k-S1.png`; `Docs/lookdev/m5-variants/variants-result.md`; `Docs/lookdev/m5-sky-1k.png`; `Docs/lookdev/m5-sky-2k.png` | 있음 2/4 | 부분 | 2K 캡처·변형 결과는 있으나 요구 파일명의 1K/2K 쌍과 명시 판정 없음 |
| M5-13 | 룩 재판정·밀도 | `Automation/measure.mjs`; `Docs/lookdev/m5-density-baseline.json`; `Docs/lookdev/m5-density-after-r96.json`; `Docs/lookdev/m5-verdict.md`; `Docs/lookdev/m5-side-by-side.png` | 있음 3/5 | 부분 | 밀도 수치는 있으나 최종 verdict·목표 나란히 비교·영하님 판정 없음 |
| M5-14 | 성능 관문 | `Docs/perf/m5-bench-r96-before.csv`; `Docs/perf/m5-bench-r96-noshadow.csv`; `Docs/qa/m5-programs.json`; `Docs/perf/m5-bench.csv`; `Docs/decisions/m5-gate.md` | 있음 3/5 | 부분 | 1회 비교는 있으나 3회 중앙값·15분 soak·WebGL2·최종 gate 없음 |
| M5-15 | 제출 문서·릴리스 | `Docs/submission/README.md`; `Docs/submission/assets-and-licenses.md`; `Docs/releases/v0.4.0-look.md` | 있음 2/3 | 부분 | 제출 문서는 있으나 릴리스 문서와 `v0.4.0-look` 태그 없음 |

## M6 증거 맵

| ID | 로드맵 행 | 증거 파일 경로 | 존재 여부 실측 | 상태 | 판정·남은 조건 |
|---|---|---|---|---|---|
| M6-01 | 범위 정정 승인 | `../CLAUDE.md`; `../계획서.md`; `src/player/input.ts` | 있음 3/3 | 미착수 | 파일은 있지만 input 주석·Action은 여전히 jump·interact 범위 밖, programs 승인도 대기 |
| M6-02 | Action 확장·바인딩 | `src/player/input.ts`; `Automation/test-input.mjs` | 있음 1/2 | 미착수 | Action 8개인 M0 계약 그대로이며 6개 신규 동작·pressed edge 없음 |
| M6-03 | 점프 | `src/player/controllers/raycast.ts`; `Automation/test-raycast.mjs` | 있음 2/2 | 미착수 | 파일은 기존 지면 raycast용이며 테스트가 오히려 jump 0을 검증; 수직 속도축 없음 |
| M6-04 | 게임 상태 저장소 | `src/game/state.ts`; `src/game/reducers.ts`; `src/store/useGame.ts`; `Automation/test-game-state.mjs` | 있음 4/4 | 완료 | Zustand 미러와 순수 reducer, 직업·메소 하한 테스트 존재 |
| M6-05 | HUD 셸 | `src/systems/ui/GameHud.tsx`; `src/systems/ui/hudTokens.ts`; `Automation/test-hud-logic.mjs`; `Docs/qa/m6-hud.png` | 있음 3/4 | 부분 | 4요소·표시 로직은 구현됐으나 720p 캡처 없음 |
| M6-06 | 아이템 아이콘 | `public/ui/items/wpn-sword-wooden.png`; `Automation/import-item-icons.mjs`; `Automation/test-item-icons.mjs`; `src/data/assets.csv` | 있음 4/4 | 완료 | 47장·3,085,045B, self 대장 행과 import/test 존재 |
| M6-07 | 직업·스탯·성장 | `src/game/data/jobs.json`; `src/game/rules/stats.ts`; `Automation/test-stats.mjs` | 있음 3/3 | 완료 | 4직업·EXP·시드 데미지/크리 테스트 존재 |
| M6-08 | 아이템·상점 규칙 | `src/game/data/items.json`; `src/game/rules/shop.ts`; `Automation/test-shop.mjs` | 있음 3/3 | 완료 | 구매·직업 제한·잔액 부족 테스트 존재 |
| M6-09 | 인벤토리 규칙 | `src/game/rules/inventory.ts`; `Automation/test-inventory.mjs` | 있음 2/2 | 완료 | 24칸·스택·장착·행운 보정 테스트 존재 |
| M6-10 | 몬스터·드롭 | `src/game/data/monsters.json`; `src/game/rules/drops.ts`; `Automation/test-drops.mjs` | 있음 3/3 | 완료 | 돼지 스탯과 10,000회 분포 테스트 존재 |
| M6-11 | 퀘스트 상태기계 | `src/game/data/quests.json`; `src/game/rules/quest.ts`; `Automation/test-quest.mjs` | 있음 3/3 | 완료 | 수락·거절·10회·보상 전이 테스트 존재 |
| M6-12 | 스킬·쿨다운 | `src/game/data/skills.json`; `src/game/rules/skills.ts`; `Automation/test-skills.mjs` | 있음 3/3 | 완료 | 4스킬·MP·쿨다운·화상 틱 테스트 존재 |
| M6-13 | 문자열·IP 표 | `src/game/data/strings.ko.json`; `src/game/i18n.ts`; `Automation/test-strings.mjs` | 있음 3/3 | 완료 | conti/own 키 동형과 own 출력 금지어 0 테스트 존재 |
| M6-14 | 지역 볼륨·진입 | `src/game/data/zones.json`; `src/game/world/zones.ts`; `Automation/test-zones.mjs` | 있음 3/3 | 완료 | 진입 1회·2m 히스테리시스 테스트 존재 |
| M6-15 | 아치·NPC·카메라 | `src/data/placement.json`; `src/player/FollowCamera.tsx`; `Automation/test-camera-ease.mjs`; `Docs/qa/m6-arch.png` | 있음 3/4 | 부분 | 배치·6→9m 이징 테스트는 있으나 길 관통 캡처 없음 |
| M6-16 | 돼지 공원 | `src/data/placement.json`; `src/game/data/spawns.json`; `Automation/test-park-layout.mjs`; `Docs/qa/m6-park.png` | 있음 3/4 | 부분 | 테라스·8 스폰 검증은 있으나 요구 캡처 없음 |
| M6-17 | NPC 메시 | `public/models/npc_stan.glb`; `public/models/npc_maya.glb`; `Docs/licenses/asset.char.npc.stan.txt`; `Docs/licenses/asset.char.npc.maya.txt` | 있음 4/4 | 부분 | 각 tris·합계 9.62MB는 통과, programs 증가 ≤1 GPU 실측 없음 |
| M6-18 | 상호작용 트리거 | `src/game/world/interact.ts`; `Automation/test-interact.mjs`; `src/systems/ui/InteractPrompt.tsx` | 있음 2/3 | 부분 | 거리·각도 판정은 있으나 “F 대화” 프롬프트 DOM 컴포넌트 없음 |
| M6-19 | 씬 상태기계 | `src/game/flow.ts`; `src/game/session.ts`; `src/systems/ui/GameOverlay.tsx`; `Automation/test-flow.mjs` | 있음 4/4 | 완료 | 11씬 전이·직접 진입 보정과 런타임 overlay 연결 존재 |
| M6-20 | S00 타이틀 | `src/systems/ui/TitleScreen.tsx`; `Automation/test-title-screen.mjs`; `public/ui/title_bg.jpg` | 있음 2/3 | 부분 | 동작·로딩 테스트는 있으나 자체 렌더 배경과 캡처 없음 |
| M6-21 | S01 캐릭터 생성 | `src/systems/ui/CharacterCreate.tsx`; `src/game/portrait/Portrait.tsx`; `Automation/test-character-create.mjs`; `Automation/test-portrait.mjs` | 있음 4/4 | 완료 | 직업 카드·키보드 선택·얼굴 조합·state 연결 테스트 존재 |
| M6-22 | S02 튜토리얼·카메라 | `src/systems/ui/TutorialHints.tsx`; `Automation/test-tutorial-hints.mjs`; `src/player/FollowCamera.tsx` | 있음 3/3 | 부분 | WASD→Shift→Space 체크는 있으나 3초 하늘→우듬지 틸트다운 구현 증거 없음 |
| M6-23 | 지역 배너 | `src/systems/ui/ZoneBanner.tsx`; `Automation/test-zone-banner.mjs` | 있음 2/2 | 완료 | 1회 이벤트·4초 hidden 로직 테스트 존재 |
| M6-24 | 대화 패널 | `src/systems/ui/DialoguePanel.tsx`; `src/game/dialogue.ts`; `Automation/test-dialogue.mjs` | 있음 3/3 | 완료 | 수락·거절·재수락과 GameOverlay HUD 숨김 연결 존재 |
| M6-25 | 상점 UI | `src/systems/ui/ShopPanel.tsx`; `Automation/test-shop-panel.mjs`; `Docs/qa/m6-shop.png` | 있음 2/3 | 부분 | 순수 shop 규칙 연결 테스트는 있으나 궁수 시나리오 캡처 없음 |
| M6-26 | 인벤토리 UI | `src/systems/ui/InventoryPanel.tsx`; `Automation/test-inventory-panel.mjs`; `Docs/qa/m6-inventory.png` | 있음 2/3 | 부분 | 그리드·장착·신규 펄스 로직은 있으나 캡처 없음 |
| M6-27 | 보상·레벨업 | `src/systems/ui/RewardPopup.tsx`; `Automation/test-reward-popup.mjs`; `src/scene/fx/LevelUpRing.tsx` | 있음 2/3 | 부분 | 보상 1회 UI는 있으나 공용 VFX 재질의 링 3개 구현 없음 |
| M6-28 | 에필로그 | `src/systems/ui/Epilogue.tsx`; `Automation/test-epilogue.mjs`; `src/data/lookdev.json` | 있음 3/3 | 부분 | 순차 페이드·재시작/자유 탐험은 있으나 warm 화이트밸런스 파라미터 증거 없음 |
| M6-29 | 돼지 메시·걷기 | `public/models/mob_pig.glb`; `Docs/qa/m6-pig-candidates-r94.json`; `src/scene/mobs/MobInstances.tsx`; `src/shaders/mobWobble.ts` | 있음 2/4 | 부분 | 1,489 tris 자산은 통과, instancing·wobble·빌보드·GPU 캡처 없음 |
| M6-30 | 몬스터 AI·스폰 | `src/game/mobs/ai.ts`; `src/game/mobs/spawner.ts`; `Automation/test-mob-ai.mjs` | 있음 3/3 | 완료 | 상태 순서·동시 10·8초 리스폰 CPU 시뮬 존재 |
| M6-31 | 전투 판정 | `src/game/rules/combat.ts`; `Automation/test-combat.mjs` | 있음 2/2 | 완료 | 기본공격·4스킬 대상 상한·공식 재사용 테스트 존재 |
| M6-32 | 데미지·HP UI | `src/systems/ui/DamageFloater.tsx`; `src/systems/ui/MobHpBar.tsx`; `Automation/test-combat-overlay.mjs` | 있음 3/3 | 완료 | 풀 16·크리·0.8초·HP 게이지 테스트 존재 |
| M6-33 | 드롭·습득 | `src/game/rules/pickup.ts`; `Automation/test-pickup.mjs`; `src/scene/fx/DropInstances.tsx` | 있음 2/3 | 부분 | 포물선·흡입·state 반영 규칙은 있으나 billboard 인스턴스 메시 없음 |
| M6-34 | 스킬 VFX | `public/textures/fx_atlas.png`; `src/game/data/fx.json`; `src/game/rules/fxTimeline.ts`; `Automation/test-fx.mjs`; `src/scene/fx/SkillFx.tsx`; `src/shaders/skillFx.ts` | 있음 4/6 | 부분 | 아틀라스·타임라인·상한 3은 완료, 단일 재질 인스턴스 런타임·4장 캡처 없음 |
| M6-35 | 사망·부활 | `src/game/rules/respawn.ts`; `Automation/test-respawn.mjs` | 있음 2/2 | 완료 | 1.5초·입구 부활·메소 보존·어그로 해제 테스트 존재 |
| M6-36 | 스토리 자동 완주 | `Automation/run-story.mjs`; `Automation/run-story-sim.mjs`; `Docs/qa/m6-story-run-headless.json`; `src/systems/bench/storyRunner.ts`; `Docs/qa/m6-story-run.json` | 있음 3/5 | 부분 | headless 84.981초·10킬·epilogue는 존재, 계약명 browser runner·최종 통합 파일 없음 |
| M6-37 | 성능 재측정 | `Docs/perf/m6-bench.csv`; `Docs/decisions/m6-gate.md` | 없음 0/2 | 미착수 | 3회 사냥·soak·programs/pipelines 최종 측정 없음 |
| M6-38 | IP·출처 검사 | `Automation/check-ip.mjs`; `Docs/qa/m6-ip-check.json`; `Docs/qa/m6-ip-check.md` | 있음 2/3 | 부분 | 검사기는 있으나 현재 src 결과 FAIL(own 미강제·고유명 71건), 최종 PASS 문서 없음 |
| M6-39 | 제출 문서·릴리스 | `Docs/submission/README.md`; `Docs/submission/assets-and-licenses.md`; `Docs/releases/v0.5.0.md` | 있음 2/3 | 부분 | 문서 기반은 있으나 v0.5.0 릴리스·태그·콘티 캡처 11장 없음 |

## 판정상 핵심 블로커

1. M6-01 승인 전 input 계약이 그대로라 M6-02·03은 실제 미착수다.
2. M5-14와 M6-37의 반복 성능·soak·WebGL2/사냥 계측, 그리고 최종 gate 문서가 없다.
3. M6-29·33·34는 자산/순수 규칙까지만 있고 scene 인스턴스·TSL 런타임이 없다.
4. M6-38은 검사 증거는 있으나 own production 강제 전이라 고유명 71건과 conti tree-shaking이 FAIL이다.
5. M5-15·M6-39 릴리스 문서·태그·최종 캡처 묶음은 아직 없다.
