# M6 게임 규칙·접착층 교차검수 — R99-B

- 검수일: 2026-08-27 KST
- 검수자: worker-codex `729f5ac5` (처음 보는 검수자 관점)
- worktree/branch: `web3d-wt-codexB` / `wt/loading`
- 기준: `main=a1e7272`, 검수 HEAD `b7c21f3` (`git merge main` 완료)
- 범위: `src/game/**`, `src/store/useGame.ts`, `src/systems/ui/*`, `Automation/run-story.mjs`, `Docs/decisions/m6-integration-checklist.md`
- 원칙: 결함 수정·add·commit·설치·GPU/브라우저 실행 없이 CPU 정적 검수와 공개 API 재현만 수행

## 1. 결론

| 심각도 | 수 | 요약 |
|---|---:|---|
| 차단 | 1 | `own` 모드에서도 넥슨 원문 고유명이 사용자 화면에 남아 외부 공개 배포를 막음 |
| 중요 | 14 | 스킬/장비 규칙 미적용, HP 표시 오상수, 드롭 풀 미연결, 처치 판정 지연, 사망·대화·씬 문맥 입력 순서, 세션/스토어 불일치 등 |
| 경미 | 6 | canonical ID/name 편차, 근거 없는 추가 상수, React 런타임 의존, 계층 역의존, 중복 구독, 문서 규칙 충돌 |
| 합계 | 21 | 코드 수정 없이 보고만 함 |

차단 결함은 `ipMode:'own'`이 표시 문자열만 바꾸고 아이템/직업/스킬 원자료의 이름을 지역화하지 않는다는 점이다. `돼지리본`은 인벤토리에 그대로 표시되고, `마야`·`돼지의 공원` 등 denylist 밖 원문 명칭도 `own` 표에 남는다.

콘티 §4 수치 대조 결과는 **직접 상수 불일치 2개 + 배율 적용 의미 불일치 1개 = 3개**다. 화상 틱 피해 5→3, 돼지 HP 65→HP바 55, 궁수 70%×5가 단일 대상 다단이 아니라 최대 5대상 각 1회로 적용된다. 그 밖의 시작 HP/MP·MP 비용·스킬 배율/대상/쿨·가격/성능·몬스터 수치·드롭·퀘스트 보상·EXP 공식·시작 메소는 데이터 상 일치한다.

## 2. 결함 목록

| ID | 심각도 | 파일:줄 | 결함·재현 | 제안 |
|---|---|---|---|---|
| B-01 | 차단 | `src/game/data/items.json:52`, `src/game/data/strings.ko.json:92-146`, `src/systems/ui/inventoryPanelLogic.ts:72-123`, `src/systems/ui/characterCreateLogic.ts:117-125` | `own`에서도 raw `item.name`을 써 `돼지리본`이 표시된다. `마야`, `돼지의 공원`, `매직클로`, `아이스에이지`는 denylist에 없어 `check-ip --src`가 잡지 못한다. `createSession({ipMode:'own'})`→리본 획득→인벤토리 hover 또는 own 문자열/캐릭터 카드 표시로 재현. | 표시 가능한 모든 고유명을 키 기반 i18n으로 바꾸고 denylist/테스트에 own 결과의 금칙어 0을 직접 검증한다. 외부 배포 전 차단 게이트로 둔다. |
| I-01 | 중요 | `src/game/data/skills.json:12-16`, `src/game/session.ts:509-525` | 콘티의 화상은 틱당 5인데 데이터는 3이며, 세션은 반환된 burn effect 자체를 폐기한다. 전사 스킬을 맞힌 뒤 3초를 tick해도 후속 피해가 없다. | 틱 피해를 SSOT와 맞추고 세션에 결정론적 상태효과 스케줄을 둔다. |
| I-02 | 중요 | `src/game/rules/combat.ts:170-205`, `Automation/test-combat.mjs:68-77` | 궁수 `70%×5 / 대상 수 5`를 최대 5대상 각 1회로 고정한다. 대상 1마리만 주면 1회 피해만 발생한다. | `hits=5`와 `targetCount=5`의 의미를 분리하고, 1대상/5대상 분배 규칙을 콘티 문구대로 테스트한다. |
| I-03 | 중요 | `src/game/data/skills.json:31-47`, `src/game/session.ts:514-525` | 빙결 0.8초와 도약/착지 효과는 데이터에만 있고 런타임에서 폐기된다. 마법사·도적 스킬 후 AI/플레이어 위치가 변하지 않는다. | effect별 순수 상태기계를 추가하거나, 미구현이면 UI/데이터에서 구현 완료로 노출하지 않는다. |
| I-04 | 중요 | `src/game/data/items.json:20,40`, `src/game/rules/combat.ts:49,101-114`, `src/game/session.ts:273-278,530-539` | 활 사거리 12m와 단검 공속 +15%가 저장만 되고 기본공격은 전 직업 1.8m, 직업별 고정 쿨만 사용한다. | 장착 보너스를 전투 range/cooldown 계산에 한 번만 반영하는 순수 파생 함수를 둔다. |
| I-05 | 중요 | `src/game/data/monsters.json:6`, `src/systems/ui/GameOverlay.tsx:86-92` | 돼지 실제 HP는 65인데 HP바 `maxHp`는 55다. 초기 HP바가 100%로 clamp되어 첫 피해 뒤 비율도 틀린다. | 몬스터 정의의 max HP를 snapshot에 싣고 UI 하드코딩을 제거한다. |
| I-06 | 중요 | `src/game/util/pool.ts:2,51-52`, `src/game/session.ts:209,299-312,544-564` | 콘티 §6의 드롭 풀 24는 단위 테스트에만 있고 세션은 무제한 배열을 쓴다. 드롭을 줍지 않고 25개 이상 생성하면 상한을 넘는다. | 세션이 `createDropPool/acquire/release`를 실제 소유하게 하고 교체 정책을 통합 테스트한다. |
| I-07 | 중요 | `src/game/rules/pickup.ts:114-129`, `src/game/session.ts:294-312,544-563` | 퀘스트 목표가 ‘10마리 처치’인데 처치 시가 아니라 메소 드롭 습득 시 `quest-kill`을 준다. 돼지를 죽이고 드롭을 피하면 EXP는 오르지만 처치 수는 0이다. | kill credit은 HP 0 전이에 즉시 1회 부여하고 드롭은 보상만 담당시킨다. |
| I-08 | 중요 | `src/game/session.ts:467-564` | 사망/`dying`이 공격·스킬·드롭 습득을 막지 않는다. 실측: mage HP 0·phase dying 다음 tick에 `{attack:true}`를 주자 `floater(damage=9)`가 발생했다. 사망 프레임에 착지 완료 드롭이 있으면 544행 이후 습득도 진행된다. | tick 초기에 플레이어 phase로 월드 의미 입력과 pickup을 gate하고, 사망 처리 뒤 그 프레임의 전투/습득을 종료한다. |
| I-09 | 중요 | `src/game/session.ts:410-442,467-542` | 대화 중에도 zone/AI/몬스터 공격이 계속된다. 실측: Stan 대화를 연 채 공원 좌표로 tick하자 active dialogue가 유지된 상태에서 HP 130→106. 또한 마지막 줄에 `{confirm:true,interact:true}`를 주면 같은 tick에 `dialogue-close` 뒤 `dialogue-open`되어 처음 노드로 재개방됐다. | 대화/상점/보상 모달을 최우선 문맥으로 두고 해당 tick의 월드 이동·전투·interact 재평가를 중단한다. |
| I-10 | 중요 | `src/game/session.ts:343-354` | `epilogueAction`에 scene guard가 없다. 새 세션 title에서 `{epilogueAction:'free'}` 한 번으로 전사·quest done 10/10·4,500메소·free로 스토리를 건너뛴다. retry는 `from:'epilogue'`를 거짓 방출하며 spawner/drops/skill/zone/purchased 등 내부 상태를 초기화하지 않는다. | `scene==='epilogue'`에서만 처리하고 전체 mutable session state를 단일 reset 함수로 재생성한다. |
| I-11 | 중요 | `src/game/session.ts:256-259,360,489,509-514`, `src/store/useGame.ts:26-41` | 스킬 사용은 `skillState.mp`만 줄이고 `game.mp`/bound zustand를 갱신하지 않는다. Overlay가 MP만 임시 덮어 가리지만 `GameState` 미러 계약은 깨진다. | MP/cooldown을 단일 상태 소스로 합치거나 명시적 reducer action으로 store와 동시에 갱신한다. |
| I-12 | 중요 | `src/game/session.ts:475-500,566-576`, `src/game/mobs/spawner.ts:70-109` | 부활 때 `clear-monster-aggro` 이벤트만 emit하고 내부 spawner의 chase/attack 상태를 지우지 않는다. zone도 respawn tick snapshot까지 park로 남는다. | respawn 처리에서 spawner AI를 wander로 실제 전이하고 zone/player controller 위치 동기 계약을 테스트한다. |
| I-13 | 중요 | `src/game/reducers.ts:27,45-56`, `src/game/session.ts:33-36`, `src/systems/ui/GameOverlay.tsx:109` | 캐릭터 생성은 portrait를 반환하지만 GameOverlay가 job/name만 enqueue하여 선택한 face/hair/skin이 `GameState.faceParts`에 저장되지 않는다. | `SessionCharacterInput`에 faceParts를 포함하고 `select-job` action까지 전달한다. |
| I-14 | 중요 | `src/game/dialogue.ts:6,77-83`, `src/game/session.ts:432-440` | `firstKill` 대화 트리는 정의됐지만 session의 유일한 `createDialogue` 호출은 NPC id `stan|maya`뿐이다. 첫 처치 내레이션이 실제 세션에서 열리지 않는다. | 최초 HP 0 전이에 `firstKill`을 1회 enqueue하고 modal 우선순위와 함께 테스트한다. |
| M-01 | 경미 | `src/game/data/items.json:3-55`, `monsters.json:2-4`, `quests.json:2-5` | 콘티 canonical ID(`wpn.*`, `itm.*`, `mob.pig.grey`, `quest.stan.pig10`)가 다른 내부 ID로 바뀌었고 ‘무쇠 단검’은 ‘철 단검’, 퀘스트명도 바뀌었다. | 외부 계약이면 원 ID를 보존하고, 의도된 내부 정규화면 매핑표를 문서화한다. |
| M-02 | 경미 | `src/game/data/jobs.json:2-43` | 콘티에 없는 baseAttack 10~14·기본공격 쿨 500~700ms가 추가됐고 `weaponId`는 사용되지 않는다. | 밸런스 SSOT에 추가값의 근거를 기록하고 미사용 필드를 제거 또는 실제 연결한다. |
| M-03 | 경미 | `src/game/portrait/Portrait.tsx:11-31` | literal `react|three` import는 0파일이지만 TSX가 `react/jsx-runtime`에 실질 의존한다. ‘src/game 전체가 React 비의존’으로 해석하면 예외 파일이다. | 표현 컴포넌트를 UI 계층으로 옮기거나 비의존 규칙의 허용 예외를 명시한다. |
| M-04 | 경미 | `src/game/session.ts:25` | 게임 계층이 UI의 `TutorialInputEvent` 타입을 역방향 import한다(type-only). | 공용 도메인 타입을 game/shared 쪽에 두고 UI가 소비하게 한다. |
| M-05 | 경미 | `src/systems/ui/GameOverlay.tsx:55-58` | 전체 `useGame()` 구독과 scene/HUD selector 구독을 동시에 해 불필요한 재렌더 경로가 중복된다. | 필요한 selector만 한 번 구독한다. |
| M-06 | 경미 | `CLAUDE.md §3`, `Docs/decisions/m6-integration-checklist.md:111-124`, `src/game/session.ts:38-42` | 프로젝트 규칙은 jump·Interact 범위 밖이라 하지만 M6 체크리스트/세션은 Space/F를 요구한다. 코드 결함보다 SSOT 충돌이다. | 영하님 승인 기준 문서 한 곳에서 M6 예외 여부를 확정한 뒤 두 문서를 맞춘다. |

## 3. 콘티 §4 수치 전수 대조

| 범주 | 대조 결과 | 불일치 |
|---|---|---:|
| 직업 | 전사 220/60, 궁수 160/80, 마법사 130/140, 도적 175/90 및 기본공격명·스킬 MP 12/15/20/14 일치 | 0 |
| 스킬 데이터 | 배율 1.8/0.7/1.5/2.4, 대상 3/5/1/2, 쿨 3/3.5/5/4초, freeze 0.8초, leap 2.5m 일치 | 1: burn 틱 5→3 |
| 스킬 런타임 의미 | 궁수 ×5, burn/freeze/leap 실제 효과 대조 | 1: 궁수 ×5 미적용. 상태효과 미구현은 별도 기능 결함 |
| 아이템 | 가격 800/900/1000/850, 공격/마력/사거리/공속/행운, 리본 판매가 120 일치 | 0 |
| 몬스터 | Lv3, HP65, 공격8, 속도1.8, 인식6, 배회5, 공격쿨2초, dying0.6초, respawn8초, EXP18 일치 | 1: UI HP바 max55 |
| 드롭 | 메소 100%·10~30 균등, 리본 15%×1 일치 | 0 |
| 퀘스트 | 10마리, 3,000메소, EXP250, 리본1 일치 | 0 (단, credit 시점은 I-07) |
| 성장 | 시작 Lv1/메소1,500, `15×Lv²`, 피해 난수0.9~1.1, 크리12%×1.5, 사망 메소 무손실 일치 | 0 |

수치 불일치 합계는 3개다. ID/name 편차와 효과 미구현은 이 합계에서 제외하고 별도 결함으로 셌다.

## 4. three/React 비의존 검사

| 검사 | 결과 |
|---|---|
| `src/game/**`, `src/store/useGame.ts`의 direct `react`, `three`, `@react-three/*` import | 0파일 |
| 실질 React 런타임 의존 | `src/game/portrait/Portrait.tsx` 1파일(JSX→`react/jsx-runtime`) |
| three 객체/React hook이 session/reducer/rules에 유입 | 0파일 |
| 계층 역의존 | `session.ts`→UI 타입 1파일(M-04) |

## 5. 테스트가 검증하지 않는 리듀서 분기

11개 action type은 적어도 한 번씩 실행된다. 아래는 action별 남은 내부 분기다.

| Action | 검증 공백 |
|---|---|
| `select-job` | `faceParts` 병합, name 생략 시 기존값 유지 |
| `damage` | 음수 amount 무시, 이미 HP0인 상태 |
| `heal` | hp/mp 생략·음수 각각, 한쪽만 회복 |
| `gain-exp` | 0·비정상 입력의 reducer 경계 |
| `adjust-meso` | 양수 증가와 0 경계 동시 확인 |
| `purchase` | `jobId=null`, reducer 차원의 직업 불일치/잔액 부족/인벤토리 full 상태 불변 |
| `gain-item` | full inventory에서 `added=0`, 일부만 들어가는 remainder |
| `quest-accept` | active/ready/done에서 no-op |
| `quest-kill` | inactive·wrong monster·이미 ready/done |
| `quest-complete` | non-ready no-op, 정의에 없는 reward item, reward가 inventory를 넘는 경우 |
| `scene-transition` | 임의 역행도 그대로 허용하는 reducer와 flow guard의 경계 |

## 6. 세션 이벤트 종류별 테스트 공백

| 이벤트 | 현재 검증 | 남은 분기/계약 |
|---|---|---|
| `scene` | main story count/trace | `free`, `retry`, 잘못된 scene 문맥, from/to 정확성 |
| `banner` | 발생 count, gate 배열 | 4초 만료, 재진입/중복 gate, zone payload |
| `camera-ease-start` | story에서 1회 | gate 이탈·재진입 정책, 같은 체류 중 재발행 금지 직접 assertion |
| `dialogue-open/close` | Stan/Maya 발생 | `s02/firstKill/s10`, close+interact 같은 tick |
| `purchase` | 성공 | 실패 시 무발행, 선택 race/잔액·직업 실패 |
| `floater` | 발생·UI pool | critical payload, dying/대화 중 금지 |
| `drop-spawn` | story count | 24 초과, payload 종류/소스, 교체 정책 |
| `drop-collect` | story count | dying 중 금지, full inventory/remainder |
| `level-up` | 발생 | previous/current payload, 한 tick 다중 레벨 |
| `death` | 발생 | 같은 frame의 공격/습득 중단, 중복 death 금지 |
| `respawn` | 발생 | player controller/zone 동기, exact 50% HP |
| `clear-monster-aggro` | 발생만 확인 | spawner가 실제 wander로 바뀌는지(현재 안 바뀜) |
| `skill-rejected` | **발생 검증 0** | `MP 부족`, `쿨다운 중` 두 reason 모두 |
| `reward` | story count | close, retry, reward item full 처리, payload |
| `tutorial` | 순서/중복 | session의 0dt·이동속도 경계와 scene 전환 동시 입력 |

## 7. own 모드와 `check-ip --src` 사각지대

| 종류 | 위치 | checker 관계 | 영향 |
|---|---|---|---|
| `돼지리본` raw item name | `items.json:52`→`inventoryPanelLogic.ts:81,99,119` | literal은 잡지만 own 경로에서 실제 표시된다는 의미는 판별 못 함 | own 인벤토리/툴팁 노출 |
| `마야` | `strings.ko.json` own `s05.maya.name` | denylist에 없어 미검출 | 넥슨 NPC명 노출 |
| `돼지의 공원` | own `s06.currentRegion/name` | denylist에 없어 미검출 | 넥슨 맵명 노출 |
| `매직클로`, `아이스에이지` | `jobs.json`, `skills.json`→캐릭터 카드/향후 공격 UI | denylist에 없어 미검출 | 넥슨 스킬명 잔존 후보 |

현재 `check-ip`의 `inspectIpPolicy()`는 `i18n.ts`의 기본 인자 `conti`를 읽어 forced-own=false로 판정한다. 체크리스트대로 production App이 own을 강제해도 raw item/job/skill 표시 경로는 별도 교정이 필요하다.

## 8. tick 순서 버그 후보와 재현 입력

| 후보 | 최소 재현 입력 시퀀스 | 결과 |
|---|---|---|
| 사망 뒤 공격 | title confirm→mage 생성→park mob 접촉을 500ms tick해 death→1.5초 안 `{attack:true}` | 실측 `phase=dying,hp=0`인데 `floater damage=9` |
| 사망 프레임 드롭 습득 | 착지 완료 meso를 1.5m 안에 둠→HP8에서 같은 tick mob attack→death | death 처리 뒤 `collectDrop`가 돌아 메소/quest가 증가하는 소스 순서 |
| 대화 중 몬스터 공격 | Stan `interact`로 대화 open→confirm 없이 playerPos를 park mob 위치로 500ms 반복 | 실측 dialogue `stan` 유지, HP130→106 |
| 대화 close 즉시 reopen | Stan 거절 노드 마지막에서 `{confirm:true,interact:true}` | 실측 이벤트 `dialogue-close`,`dialogue-open`, node `first` |
| 씬 문맥 없는 free | 새 title 세션 첫 tick `{epilogueAction:'free'}` | 실측 free·기본전사·quest done10/10·meso4500으로 즉시 보정 |
| retry 부분 초기화 | epilogue 완주 뒤 `{epilogueAction:'retry'}`→재시작 | game 일부만 초기화되고 spawner/drop/skill/zone/purchased/acquiredAt는 이전 run 잔존 |
| 부활 어그로 잔존 | park death→1.5초 respawn→spawner 상태 조회 | clear 이벤트는 있으나 AI state mutation 없음; 다음 controller tick 위치 동기 실패 시 재공격 가능 |

## 9. `m6-integration-checklist.md` 교차대조

코드 상태와 체크박스의 직접 불일치는 **0개**다. App에 `createSession/GameOverlay/cameraYaw/키 바인딩`이 아직 없고 Master 완료 체크 8개가 모두 `[ ]`인 것은 현재 HEAD를 정확히 반영한다. `?scene=`의 `initialScene` 부재와 `?route=story` 미구현도 문서가 미완으로 명시한다.

| 항목 | 코드 대조 |
|---|---|
| §0 session/store/Overlay 경계 | direct three/React/DOM key 유입 0, 위치는 store에 넣지 않음, Overlay bind 1회. 단 type-only UI 역의존 M-04 |
| §1~4 App/bridge/Overlay | 아직 미연결이며 체크 `[ ]`와 일치 |
| §5 입력 | App 미연결과 일치. 단 CLAUDE의 jump/Interact 범위 밖 규칙과 충돌(M-06) |
| §6 NPC/gate/park | session이 같은 placement/zones/spawns id·좌표를 읽음. 런타임 렌더는 문서대로 미완 |
| §7 debug scene | parser만 있고 `initialScene` 없음; 문서 설명과 일치 |
| §8 own 정책 | App production 강제 미연결; 체크 `[ ]`와 일치. B-01은 강제 후에도 남는 별도 결함 |
| §9 headless 기준 | 재실행 84.981초·361.140m·646tick·10처치·3,785메소·Lv4 exp220·done·순서 위반0으로 일치 |

## 10. 독립 두 축 리뷰 (`code-review` 스킬)

### Standards

- 문서 규칙: direct three/React import는 0이나 `Portrait.tsx`의 JSX 런타임 의존 1건, jump/interact 문서 충돌 1건, game→UI type 역의존 1건.
- 판단형 smell: `session.ts`의 Divergent Change, `SessionEvent` optional payload의 Primitive Obsession, 아이템 인덱스 중복의 Shotgun Surgery/Duplicated Code, GameOverlay 구독 중복.
- 최악 항목: 순수 규칙 경계로 오해하기 쉬운 `src/game/portrait/Portrait.tsx`의 숨은 React 런타임 의존.

### Spec

- 독립 검수 8건: 화상 수치/미적용, 궁수 ×5 의미, freeze/leap 미적용, 장비 range/공속 미적용, HP바55, drop pool 미연결, canonical ID/name 편차, 근거 없는 추가 공격 상수.
- 최악 항목: 데이터에는 존재하지만 세션에서 폐기되는 스킬 효과와 무시되는 장비 성능.

축별 요약: Standards 3개 규칙 항목+4개 판단형 smell, Spec 8개 항목. 두 축의 순위는 합치지 않았다.

## 11. 실측 검증

| 명령/검증 | 결과 |
|---|---|
| `npx tsc -b` | exit 0, 진단 0 |
| `node --test` + `rg --files Automation -g 'test-*.mjs'` 전체 | 396 tests / 63 suites / pass 396 / fail 0 / skipped 0 / todo 0 |
| `runStory()` 무기록 재실행 | 84.981초, 361.140m, 646tick, 10처치, 3,785메소, Lv4 exp220, quest done, event order violation 0 |
| direct React/three import 검색 | 0파일 |
| 공개 API 순서 재현 | dying 공격, 대화 중 피격, close+reopen, title→free 우회 모두 재현 |

전체 테스트는 결함 재현 분기를 포함하지 않아 녹색이다. 테스트가 통과한다는 사실과 규칙/세션 순서가 맞다는 사실을 분리해 판정해야 한다.
