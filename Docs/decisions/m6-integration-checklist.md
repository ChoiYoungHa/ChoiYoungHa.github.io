# M6 런타임 통합 체크리스트

기준: 2026-08-27 · `wt/loading` `a2485de` · 순수 접착층은 R95-B에서 완료했으며 이 문서는 `App.tsx` 통합 순서를 고정한다.

## 0. 먼저 지킬 경계

- `src/game/session.ts:createSession`(약 193행)은 시간·위치·yaw·의미 입력만 받는다. DOM 키 코드, three 객체, React 훅을 넣지 않는다.
- `src/store/useGame.ts:useGame`(약 14행)은 `GameState`와 `dispatch`의 zustand 미러다. 매 프레임 위치는 넣지 않는다.
- `src/App.tsx:Stage`(약 61행)는 R86-A의 `memo` 경계다. 로딩 progress 같은 매번 바뀌는 값을 props에 추가하면 WebGPU 렌더러 중복 생성 결함이 되살아날 수 있다.
- `src/systems/ui/GameOverlay.tsx:GameOverlay`(54행)는 `useEffect(() => session.bind(useGame))`(68행)를 이미 수행한다. App에서 `session.bind(useGame)`를 한 번 더 호출하지 않는다.

## 1. 세션 생성과 스토어 연결

`src/App.tsx` import 근처와 `App()` 초기화부(현재 96~107행)에 다음 순서로 둔다. 세션 객체는 렌더마다 새로 만들지 않는다.

```tsx
import { useMemo, useRef } from 'react'
import { createSession } from './game/session'
import type { GameProjector } from './systems/ui/GameOverlay'
import { GameOverlay } from './systems/ui/GameOverlay'

const session = useMemo(() => createSession({ seed: 45, ipMode }), [ipMode])
const projectorRef = useRef<GameProjector>(() => ({ x: 0, y: 0, visible: false }))
const projector = useMemo<GameProjector>(() => (point) => projectorRef.current(point), [])
const cameraDistanceRef = useRef(CAMERA.distance)
const backend = useRuntime((state) => state.backend)
```

`ipMode`가 바뀌면 새 게임을 시작한다는 전제다. 런타임 중 모드만 바꾸려면 세션 재생성 대신 별도 액션이 필요하다.

## 2. Canvas 안 프레임 브리지와 projector

`Vector3.project(camera)`는 Canvas context가 필요하므로 `GameOverlay` 안에서 직접 호출하지 않는다. `src/App.tsx:Stage`의 `<Canvas>` 내부, `<RuntimeProbe />` 부근(현재 77행)에 아래와 같은 작은 브리지를 한 번 마운트한다.

```tsx
function GameSessionBridge({ session, projectorRef, cameraDistanceRef }: {
  session: GameSession
  projectorRef: { current: GameProjector }
  cameraDistanceRef: { current: number }
}) {
  const { camera, size } = useThree()
  const projected = useMemo(() => new Vector3(), [])
  const cameraEaseStartedAtMs = useRef<number | null>(null)

  useFrame((_, dt) => {
    projectorRef.current = ({ x, y = 0, z }) => {
      projected.set(x, y, z).project(camera)
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        visible: projected.z >= -1 && projected.z <= 1,
      }
    }
    const frame = readPlayerFrame()
    if (frame === null) return
    const result = session.tick({
      dtMs: Math.min(dt, 1 / 20) * 1000,
      playerPos: frame.position,
      playerYaw: frame.cameraYaw,
      inputs: { move: frame.speed > 0.05, run: frame.speed > 3.3 },
    })
    if (result.events.some((event) => event.type === 'camera-ease-start')) {
      cameraEaseStartedAtMs.current = result.snapshot.nowMs
    }
    if (cameraEaseStartedAtMs.current !== null) {
      cameraDistanceRef.current = easeDistance(
        (result.snapshot.nowMs - cameraEaseStartedAtMs.current) / 1000,
      )
    }
  })
  return null
}
```

필요 import는 `useFrame`·`useThree`, `Vector3`, `readPlayerFrame`, `GameSession`, `easeDistance`다. `Stage`에는 안정적인 `session`·`projectorRef`·`cameraDistanceRef`만 추가하고, `loading` 전체 객체는 넘기지 않는다.

## 3. 컨트롤러 위치와 yaw 공급

현재 경로는 `src/player/Controller.tsx:publishPlayerFrame(r, dt)`(약 105행) → `src/store/playerBridge.ts:readPlayerFrame()`(약 69행)이다. `PlayerFrame.position`·`speed`·`grounded`는 그대로 쓴다.

주의: 기존 `PlayerFrame.heading`은 `controllers/raycast.ts`에서 **이동 중에만** 갱신되는 캐릭터 방향이다. 정지 상태에서 마우스로 NPC/몬스터를 조준해도 바뀌게 아래처럼 카메라 yaw를 추가한다.

```ts
// playerBridge.ts
export interface PlayerFrame { /* 기존 필드 */ cameraYaw: number }

// Controller.tsx, controller.step 직후
publishPlayerFrame({ ...r, cameraYaw: yawRef.current }, dt)
```

세션 `playerYaw`에는 `heading`이 아니라 `cameraYaw`를 전달한다. 이 변경 전 임시로 `heading`을 쓸 수는 있지만 정지 조준 경계 테스트는 통과 기준에서 제외해야 한다.

## 4. GameOverlay 마운트

`src/App.tsx` 반환부에서 `<RuntimeHud />` 다음, 기존 `<ControlsHint />`·`<Settings />`·`<LoadingScreen />` 옆(현재 125~131행)에 둔다. `shot` 캡처에서는 게임 UI를 숨긴다.

```tsx
{shot ? null : (
  <GameOverlay
    session={session}
    loading={loading}
    backend={backend}
    preset={preset}
    projector={projector}
  />
)}
```

`useLoadingState()`는 원래 상태(`phase/loadedBytes/phaseBytes/error`)를 spread하므로 `GameOverlay.loading`에 그대로 전달 가능하다. 기존 `LoadingScreen`은 초기 로딩 오류·재시도 안전망으로 우선 유지하고, 타이틀의 진행률과 겹침은 브라우저 검수 후 한쪽만 남긴다.

## 5. 입력 바인딩 표 — M6-02 승인 후

DOM 리스너는 `session.ts`나 개별 UI에 넣지 않고 App 전용 훅 한 곳에서 `session.enqueueInput()`만 호출한다. `repeat`은 공격/스킬/상호작용/토글에서 무시하고, text input·button에 포커스가 있으면 게임 키를 소비하지 않는다.

| 키 | 의미 입력 | 조건 |
|---|---|---|
| `Space` | `{ jump: true }` 또는 대화 중 `{ confirm: true }` | 대화가 우선; 실제 점프 물리는 별도 M6-01 연결 |
| `F` | `{ interact: true }` | 대화/상점 UI가 닫힌 월드 상태 |
| `1` | `{ attack: true }` | 필드·hunt, 입력 1회당 기본 공격 1회 |
| `2` | `{ skill: true }` | 필드·hunt, MP·쿨다운은 세션 규칙이 판정 |
| `I` | `{ inventory: true }` | 반복 입력 무시, 세션이 open 상태 토글 |
| `Enter` | `{ confirm: true }` | 타이틀·생성·대화·상점의 현재 문맥 |

WASD/Shift는 기존 `createKeyboardInput()`이 컨트롤러에 남고, 프레임 브리지가 실제 `speed`로 tutorial의 `move/run`을 공급한다.

## 6. NPC·아치·공원과 카메라 이징

런타임 좌표의 단일 소스는 다음과 같다.

- NPC: `src/data/placement.json:npcs`(22행), `stan=(-4.104056,3.276014)`, `maya=(-5.449660,17.660593)`. 렌더는 `sampleHeight(x,z)`로 y를 정하고 id를 바꾸지 않는다. 세션 상호작용 목록은 이미 이 배열을 읽는다.
- 아치: `placement.props[kind=arch]=(-1.5,19.8)`(43행)와 `src/game/data/zones.json:triggers.villageGate`(6행)는 같은 위치다. `villageGate`는 지역이 아니라 trigger다. `zones.zones`로 옮기면 세 지역 상호 배타 규칙이 깨진다.
- 공원: `zones.park=(-80,8), r40`, `park-terraces.json` 3단, `spawns.json` 8점, `placement.props[kind=statue]` 2개를 함께 읽는다. statue는 승인 전 `runtimeMeshKind: stonewall`을 사용한다.

미완 런타임 매핑은 `Docs/decisions/m6-world-layout.md` 체크리스트를 그대로 수행한다: NPC 메시·상호작용 id, 3단 단구 메시/콜라이더, statue 대체 메시, 접지·겹침 브라우저 확인.

세션 tick 결과의 최초 `camera-ease-start` 이벤트를 위 `cameraEaseStartedAtMs` ref에 저장하고 `src/game/world/cameraEase.ts:easeDistance(elapsedSeconds)`를 FollowCamera 거리 계산에 주입한다. 0/1/2초의 거리는 6/7.5/9m이며 같은 gate 체류 중 다시 시작하지 않는다. `Player`에 `cameraDistanceRef` 선택 prop을 추가해 `<FollowCamera targetRef={posRef} yawRef={yawRef} distanceRef={cameraDistanceRef} />`로 전달하고, `FollowCamera.tsx` 약 37행의 두 `CAMERA.distance`를 `const distance = distanceRef?.current ?? CAMERA.distance`로 치환한 뒤 그 지역 변수로 계산한다.

## 7. `?scene=` 디버그

파서는 `src/game/flow.ts:parseSceneQuery`(82행)에 있으나 R95 세션에는 강제 진입 API가 없다. App에서 zustand만 바꾸면 세션 내부 상태와 갈라지므로 금지한다.

권장 최소 변경은 `CreateSessionOptions.initialScene?: GameScene`을 추가하고 `createSession` 초기화 직후 `game = enter(initialScene, game)`로 보정하는 것이다. App에서는 개발 빌드에서만 사용한다.

```ts
const debugScene = import.meta.env.DEV ? parseSceneQuery(location.href) : null
const session = createSession({ seed: 45, ipMode, initialScene: debugScene ?? undefined })
```

## 8. ipMode 정책

배포 기본값은 `own`으로 강제한다. 콘티 원문 모드는 로컬 비교 전용이다.

```ts
const requestedIp = params.get('ip')
const ipMode = import.meta.env.PROD
  ? 'own'
  : requestedIp === 'conti' ? 'conti' : 'own'
```

`createInitialState()`의 기본 `conti`에 기대지 말고 반드시 `createSession({ ipMode })`에서 정한다. `strings.ko.json` 두 표의 키 누락은 `Automation/test-strings.mjs`로 막는다.

## 9. 검증 순서

1. `node Automation/run-story.mjs --out Docs/qa/m6-story-run-headless.json` 후 `node --test Automation/test-session.mjs`, `node --test Automation/test-run-story.mjs`: 84.981초·10처치·3,785메소·Lv4·quest done·이벤트 순서 위반 0.
2. `npx tsc -b`와 기존 game/UI Node 회귀를 개별 실행한다.
3. 브라우저 `?scene=create`, `?scene=hunt`로 각 화면과 projector를 먼저 확인한 뒤 `?route=story` 자동 경로를 연결한다. 현재 `?route=story`는 **미구현**이므로 bench 입력 소스 또는 별도 story 러너 연결이 필요하다.
4. 실제 키로 title→create→forest→Stan→Maya→park→10처치→완료→epilogue를 한 번 완주한다. 정지 상태 F/스킬 yaw, gate 카메라 이벤트 1회, 드롭 처치 중복 0을 확인한다.
5. WebGPU low 1280×720에서 S00/S01/S04/S05/S07/S09/S10과 NPC·gate·park 캡처를 남기고, console/shader error 0 및 programs 예산을 재확인한다.

## Master 완료 체크

- [ ] 세션 객체와 projector 함수가 App 수명 동안 안정적이다.
- [ ] `PlayerFrame.cameraYaw`와 프레임 tick 브리지가 연결됐다.
- [ ] M6-02 승인 키만 의미 입력으로 enqueue한다.
- [ ] GameOverlay가 shot 외 DOM 레이어에 한 번만 마운트된다.
- [ ] NPC·gate·park 렌더 데이터가 순수 판정 데이터와 같은 id/좌표를 쓴다.
- [ ] gate 진입 카메라 이징이 1회이고 2초 뒤 9m다.
- [ ] 배포 ipMode가 own이며 debug scene/story 경로가 production에서 비활성 또는 통제된다.
- [ ] 헤드리스→브라우저 story→캡처 순서로 증거를 갱신했다.

## R107 구현 결과 (2026-08-27)

R107-B는 승인 대기 입력과 M6 런타임을 **기본 OFF**로 통합했다. `src/player/input.ts:40-48`의 `GAME_INPUT_ENABLED`는 `?game=1` 또는 `VITE_GAME=1`에서만 켜지며, `src/App.tsx:28-29,96,132`는 게임 런타임과 DOM 오버레이를 lazy chunk로 분리해 기본 URL·`?route=bench`·`?route=final`에서 import/마운트하지 않는다. `Space`는 edge 입력만 만들고 점프 물리는 이번 라운드에 넣지 않았다.

| 순서 | 결과 | 구현 파일·핵심 지점 |
|---:|---|---|
| ① 세션·스토어 | 완료 | `src/game/bootstrap.ts:20-50`이 game/scene/ipMode를 파싱하고 seed 45 세션을 한 번 생성해 `session.bind(useGame)`한다. `src/game/session.ts:150,206`은 개발용 `initialScene`을 상태 머신으로 진입시킨다. |
| ② App 마운트 | 완료 | `src/App.tsx:28-29,96,132`의 lazy `GameRuntime`·`GameOverlay`가 gate와 `!shot` 안에서만 마운트된다. 기존 Stage memo 경계와 3개 UI 수명은 유지했다. |
| ③ projector | 완료 | `src/systems/ui/projector.ts:16-42`가 R3F 카메라의 `Vector3.project` 결과를 Canvas px로 바꾸고 NDC x/y/z 밖을 숨긴다. `GameRuntime.tsx:142-145,157`에서 안정 함수에 설치한다. |
| ④ 위치·yaw·tick | 완료 | `src/scene/GameRuntime.tsx:183-200`의 이 파일 유일 `useFrame`이 `readPlayerFrame()` 위치와 실제 카메라 방향 yaw를 `src/game/bridge.ts:29-58`에 공급한다. bridge가 dt를 50ms로 clamp하고 `session.tick`을 호출한다. |
| ⑤ 입력 | 완료 | `src/player/input.ts:7-35,70-118`에 Action 6개와 Space/F/1/2/I/Enter edge를 추가했다. `GameRuntime.tsx:158-170` effect가 StrictMode-safe하게 listener를 만들고 정리하며 bridge가 `session.enqueueInput`한다. |
| ⑥ NPC·아치·공원 | 완료 | `src/scene/GameRuntime.tsx:116-269`가 Stan/Maya GLB, `collisionRadiusMeters` hit proxy, 돼지 GLB InstancedMesh ≤10, stonewall 석상, `park-terraces.json` 3개 원판의 기존 seeded `scatter`/rock geometry를 연결한다. 아치는 기존 placement 메시를 유지하고 `src/game/session.ts:191,450-461`이 같은 `triggers.villageGate` 진입을 사용한다. |
| ⑦ 카메라 이징 | 완료 | `src/game/bridge.ts:42-49`가 첫 `camera-ease-start`부터 `easeDistance` 배율을 발행하고 `src/player/FollowCamera.tsx:40-43`이 gate 안에서 거리 상수에 곱한다. 0/1/2초 6/7.5/9m이며 dispose 시 6m로 복구한다. |
| ⑧ 드롭·플로터·HP | 완료 | `src/scene/GameRuntime.tsx:145-154,219-235,268`은 `/ui/items/itm-meso.png` 단일 재질 InstancedMesh ≤24 billboard를 갱신한다. `src/systems/ui/GameOverlay.tsx:68-99,124-125`는 세션 이벤트/스냅샷을 R90 `DamageFloater`·`MobHpBar` DOM에 연결한다. |

### CPU 검증 결과

- `npx tsc -b`: exit 0.
- `npm run build`: exit 0, 706 modules. 기본 main chunk는 865.61kB이고 게임은 `GameRuntime` 7.16kB, `GameOverlay` 57.22kB 등 lazy chunk로 분리됐다.
- 관련 회귀 10파일: 73/73 통과(`final-route`, `colliders`, `input`, `raycast`, `game-integration`, `session`, `camera-ease`, `npc-placement`, `park-layout`, `run-story`).
- 전체 `Automation/test-*.mjs`: 420개 중 410 통과, 10 실패. 실패는 양쪽 merge parent에 이미 있던 `src/data/assets.csv`의 `asset.hero.tree.a` 20열/헤더 19열 불일치로 `grass-lite` 2, `rock-lite` 3, `scene-tris` 5가 같은 parser 오류를 낸 것이며 R107 수정 파일과 무관하다.
- `npm run lint`: exit 0(기존 경고만), `node Automation/check-ip.mjs --src`: PASS. 별도 dist 감사는 own-visible string 0은 통과했지만 lazy 게임 청크에 conti 비교표/내부 영문 식별자가 남고 기존 normal map 2개가 ledger 미등록이라 FAIL이며 후속 tree-shaking/ledger 정리가 필요하다.
- `node Automation/run-story.mjs`: exit 0, 84.981초·10처치·3,785메소·Lv4·quest done·이벤트 순서 위반 0. 이 worker는 지시대로 브라우저를 실행하지 않았다.

### worker-claude main 브라우저 검증 절차

1. 먼저 `/`, `?route=bench`, `?route=final`을 각각 열어 `[data-game-overlay]`와 `m6-game-runtime`이 없고 기존 캡처·renderer/program/프레임 관문이 그대로인지 확인한다.
2. `?game=1`에서 타이틀→생성→필드로 진입하고 Enter/Space/F/1/2/I edge가 한 keydown에 한 번만 동작하는지, 입력/버튼 포커스와 key repeat이 무시되는지 확인한다. Space 점프 물리는 아직 없어야 한다.
3. 개발 서버에서 `?game=1&scene=create`, `?game=1&scene=hunt`로 화면·DOM projector를 확인한다. 정지한 채 카메라만 돌린 뒤 F/공격/스킬 조준, 화면 밖 floater/HP bar 숨김도 확인한다.
4. 아치를 통과해 카메라 거리가 2초 동안 6→9m로 한 번만 이징되는지 보고, Stan/Maya 접지·yaw·충돌 반경, 돼지 10마리 이하 접지, 단구 3원판·석상 실루엣, 처치 드롭 billboard/플로터/HP bar를 확인한다.
5. WebGPU low 1280×720에서 S00/S01/S04/S05/S07/S09/S10과 NPC·gate·park·drop 추가 컷을 캡처하고 console/shader error 0, programs 예산, 아치/집/지형 관통 0을 기록한다.

씬/플레이어 수정 범위는 `src/App.tsx`, 신설 `src/scene/GameRuntime.tsx`, `src/player/input.ts`, `src/player/FollowCamera.tsx`에 한정했다. 다른 `src/scene/*`와 `src/player/controllers/*`는 수정하지 않았다.

## R110 렌더부 (2026-08-27)

R110-B는 기존 `?game=1` lazy chunk 안에만 SkillFx·레벨업 링·돼지 wobble을 연결했다. `src/game/session.ts:78,598-622`가 성공한 스킬마다 위치·yaw·대상·impact·landing을 포함한 `fx-spawn`을 1회 내고, `src/scene/fx/fxInstances.ts:86,140-210`이 `fxTimeline`을 이용해 동시 3개·최대 30 인스턴스로 제한한다. 궁수는 한 프레임에 화살 5+리본 5, 얼음은 stagger 고드름 3을 포함한다.

### 렌더와 재질 계약

| 대상 | 구현 | 활성 재질 증감 | programs 예상 |
|---|---|---:|---:|
| SkillFx | `src/shaders/skillFx.ts:5-35`, `src/scene/fx/SkillFx.tsx:20-77`; atlas rect+frame UV, 선형 instanceColor, alphaTest 0.5, DoubleSide, `life` 중심축소, full/y billboard | +1 | +1 |
| LevelUpRing | `src/scene/fx/LevelUpRing.tsx:19-70`; 같은 재질·atlas (0.75,0.75) 링 3개가 200ms stagger로 상승하고 1.2s에 종료 | +0(공유) | +0(공유) |
| 돼지 wobble | `src/shaders/mobWobble.ts:5-46`, `src/scene/GameRuntime.tsx:152-157,239-249,286`; GLB 원재질을 1:1 NodeMaterial로 교체, `speed` instance 속성·instanceId 위상·y<0.3 z wobble, 정지/빙결 0 | +0(교체) | +1 |
| 드롭 billboard | `src/scene/GameRuntime.tsx:171-173,251-269,299` 기존 재질 유지 | +0 | +0(기존) |

R107 대비 활성 재질은 총 **+1**, 예상 shader programs는 **+2**, 새 draw call은 SkillFx+LevelUpRing **+2**다. SkillFx와 LevelUpRing은 한 `MeshBasicNodeMaterial` 인스턴스를 공유한다. 드롭 아이콘은 `/ui/items/itm-meso.png`로 FX atlas 밖의 별도 map이어서 같은 material 객체로 합치면 atlas UV 계약 또는 아이콘이 깨지므로, 지시된 예외에 따라 기존 `MeshBasicMaterial`을 유지했다.

### CPU·GPU 확인점

- CPU: `Automation/test-fx-instances.mjs`가 이벤트→uvRect/color/frame/life/attachment, 화살5+리본5, 4번째 요청 시 최신 3개, 상한 30, 레벨 링 1.2s를 검증한다. `Automation/test-wobble.mjs`는 진폭 0.06·주파수 8·y<0.3 mask·speed 0 정지를 검증한다.
- 회귀·빌드: 전체 `Automation/test-*.mjs` 425/425, `npx tsc -b`, `npm run build`가 모두 exit 0이다(714 modules, `GameRuntime` lazy chunk 17.45kB). `npm run lint`도 exit 0이며 새 R110 경고는 0건이고 기존 파일 경고만 남는다. 헤드리스 story는 84.981초·10처치·`fx-spawn` 5·순서 위반 0이며 브라우저는 이 worker가 실행하지 않았다.
- worker-claude는 main에서 `?game=1&scene=hunt`와 직업 4종 실제 선택으로 스킬 4장을 캡처한다: 전사 부채꼴+화염, 궁수 화살5+리본5, 마법사 고드름3+빙결, 도적 landing X참격+링. 카메라 회전 시 full/y billboard, 동시 4번째 교체, 화면 잔상 0을 본다.
- 같은 경로에서 돼지 이동/정지/빙결의 하체만 흔들리는지, 10마리 위상이 같은 박자로 겹치지 않는지 확인한다. 레벨업 순간 발밑 금색 링 3개의 순차 상승과 1.2s 종료를 캡처한다.
- GPU 증거에는 R107 같은 preset/해상도에서 material **+1**, programs **+2 이하**, calls **+2 이하**, console/shader error 0을 기록한다. 실측이 예상보다 크면 우선 SkillFx/LevelUp이 동일 material UUID인지와 pig 원재질이 씬에 중복 잔존하는지 확인한다.

## R111 게이트 안 A 트랙 (2026-08-27)

R111-B는 점프·오프닝 카메라·에필로그 그레이드·상호작용 프롬프트를 모두 `GAME_INPUT_ENABLED` 경계 안에 연결했다. `src/player/Controller.tsx:49,101-104`는 gate가 켜질 때만 raycast의 jump 축과 런타임 edge를 사용하고, 기본값은 `jumpEnabled: false`다. 승인 거부 시 게임 gate와 이번 런타임 연결을 함께 제거할 수 있으며 `/`, `?route=bench`, `?route=final`의 기존 controller 수치는 변하지 않는다.

| 항목 | 구현·계약 | CPU 증거 |
|---|---|---|
| M6-03 점프 | `src/player/controllers/types.ts:46-48,59-61`의 5.2m/s·−18m/s², `src/player/controllers/raycast.ts:109-140`의 takeoff/air/land 축. 공중은 snap을 건너뛰고 하강 시 지면보다 낮아지기 전에 clamp하며 착지 뒤 snap으로 복귀한다. `src/game/bridge.ts:12,40-43`은 대화가 닫힌 월드 씬에서만 Space edge를 물리 신호로 보낸다. | `Automation/test-jump.mjs`: 정점 **0.708m**(0.75±0.05), 체공 **0.567s**(0.58±0.05), 공중 연타 재점프 0, 40° 경사 관통 0. `Automation/test-raycast.mjs` 기존 12/12와 gate-OFF 180프레임 deepEqual 통과. |
| M6-22 오프닝 | `src/game/cameraIntro.ts:1-65`가 0초 하늘 `(38,80,-96)` → 1.5초 우듬지 `(38,50,-96)` → 3초 현재 플레이어를 smoothstep 보간하고 인계 플래그를 낸다. `src/game/bridge.ts:57-66`이 forest 진입 1회 경과를 발행하고 `src/player/FollowCamera.tsx:43-58`이 gate 안에서만 읽는다. | `Automation/test-camera-intro.mjs`: 0/1.5/3초 target·pitch, 3초 이후 인계 자세 고정 통과. |
| M6-28 에필로그 | `src/data/lookdev.json:22`의 단일 키 `epilogueWarmExposureMultiplier=1.12`를 `src/game/epilogueGrade.ts:3-12`가 2초 smoothstep exposure로 계산한다. `src/scene/GameRuntime.tsx:240-250`이 epilogue에서만 renderer 값을 적용하고 이탈·unmount 시 원값을 복구한다. 재질·program 증가 0. | `Automation/test-epilogue-grade.mjs`: 0/1/2초 0.44→0.4664→0.4928, 2초 이후 clamp 통과. |
| M6-18 프롬프트 | `src/systems/ui/GameOverlay.tsx:99-101,127`이 기존 `findInteractable` 결과를 1회 전달하고, `src/systems/ui/InteractPrompt.tsx:1-28`이 id가 있을 때만 `F 대화` DOM 하나를 표시한다. 대화가 열리면 null로 숨긴다. | `Automation/test-interact.mjs`: 기존 2.5m·90° 경계와 prompt DOM 단일 마운트 통과. |

### R111 CPU 결과와 worker-claude 확인 절차

- 전체 `Automation/test-*.mjs` **434/434**, `npx tsc -b`, `npm run lint`, `npm run build`가 모두 exit 0이다. build는 718 modules, `GameRuntime` 18.41kB, `GameOverlay` 57.81kB이며 R111 재질·program·draw call 증가는 0이다.
- `node Automation/run-story.mjs`는 84.981초·10처치·3,785메소·Lv4·`fx-spawn` 5·이벤트 순서 위반 0으로 기존 헤드리스 결과를 유지했다. 이 worker는 지시대로 브라우저를 실행하지 않았다.
- main에서 먼저 `/`, `?route=bench`, `?route=final`을 실행해 Space가 수직 위치를 바꾸지 않고 기존 final-route·collider 결과가 같은지 확인한다. 이어 `?game=1&scene=forest`에서 Space 1회 정점 약 0.75m·체공 약 0.58초, 공중 연타 0, 착지 후 접지 복귀를 측면 캡처한다.
- 같은 forest 진입 직후 0초 하늘·1.5초 거대 수목 우듬지·3초 플레이어 인계 3장을 고정 시간으로 캡처하고, 3초 뒤 마우스 yaw와 FollowCamera 거리 이징이 정상인지 본다.
- Stan/Maya의 2.5m·전방 90° 안팎을 왕복해 프롬프트 DOM이 각각 1/0개인지, F 직후 프롬프트가 사라지고 대화가 한 번 열리는지 확인한다. 대화 중 Space는 confirm만 하고 플레이어가 뜨지 않아야 한다.
- `?game=1&scene=epilogue`에서 renderer exposure가 2초 동안 시작값×1.12로 올라가고 material/program/call이 늘지 않는지 기록한다. 다시 하기·자유 탐험 뒤에는 원 exposure가 복구되고 console/shader error가 0이어야 한다.

## R113 R109 브라우저 결함 수정 (2026-08-27)

R113-B는 R109 결함 정본의 D1·D2·D3·D4/D8·D7·D10·D12를 `?game=1` 경계 안에서 수정했다. 기본 URL·`?route=bench`·`?route=final`은 기존 컨트롤러·소품 인스턴스·디버그 HUD 경로를 유지하며, D5·D6·D9·D11은 이번 범위 밖이라 변경하지 않았다.

| 결함 | 구현·계약 | CPU 증거 |
|---|---|---|
| D1 전방 x 부호 | 이동 규약의 소유 파일 `src/player/input.ts:50-57`에서 뽑은 `forwardFromYaw=(-sin(yaw),-cos(yaw))`를 `combat.ts:79`, `interact.ts:27`, `raycast.ts:55`가 함께 사용한다. 세션의 대상 없는 스킬 부착점도 같은 함수로 맞췄고 `Automation/game-walk.mjs`의 전투/NPC yaw 반전 우회를 제거했다. | `Automation/test-forward.mjs`: yaw 0/±π/2, +π/2 정면 공격·상호작용, 러너 우회 부재 통과. 헤드리스 story는 별도 yaw 보정 없이 10/10 처치한다. |
| D2 문 열림 | `src/game/rules/gateDoor.ts:1-41`이 7m 열림·12m 닫힘 히스테리시스와 1초 cubic ease-out을 결정론적으로 계산한다. `src/scene/village/Props.tsx:115-153,179`는 게임 gate에서만 GLB의 left/right 노드를 원래 바깥 모서리 원점에 둔 채 y축 ±100°로 돌리고, OFF에서는 기존 단일 InstancedMesh 아치를 그대로 쓴다. | `Automation/test-gate-door.mjs`: 0/0.5/1.0초 **0°/87.5°/100°**, 이탈 1초 닫힘, OFF step 호출 0, GLB 힌지 accessor 검증 통과. 문틀은 기존 `collision:none`을 유지해 열린 통로 안 이동을 막지 않는다. |
| D3 상점 confirm | `src/game/session.ts:251,499-505,532-534`의 `shopConfirmGuard`가 Maya 종료 edge를 구매로 재사용하지 않는다. 다음 중립 frame 또는 첫 edge 한 번 뒤에만 패널의 선택 item을 구매한다. | `Automation/test-session.mjs`: 상점 전환 직후 confirm 메소 1,500 유지·purchase 0, 다음 confirm에서 사냥활 구매·메소 600 통과. |
| D4/D8 HUD | `src/systems/runtimeHudGate.ts:1-3`과 `src/App.tsx:131`이 게임에서 `?hud=1`일 때만 디버그 HUD를 표시한다. 표시한 경우 `RuntimeHud.tsx:120`의 거리 값은 실제 camera easing multiplier를 곱한다. | `Automation/test-runtime-hud-gate.mjs`: 기본/bench 표시, game 숨김, game+hud 표시와 multiplier 연결 통과. |
| D7 title Enter | `src/game/titleConfirmBuffer.ts:1-22`가 준비 전 confirm을 최대 1개 보존한다. `runtimeReadiness.ts`를 `GameRuntime.tsx:194-196`과 `GameOverlay.tsx:78-97`이 공유해 Suspense 뒤 bridge 준비 시 정확히 한 번 방출한다. | `Automation/test-title-confirm-buffer.mjs`: 준비 전 반복 Enter 1개 보존, 준비 시 1회 방출, 준비 후 즉시 방출 통과. StrictMode cleanup/setup도 readiness를 되돌린다. |
| D10 firstKill | 세션의 기존 `session.ts:546` 대화 gate가 activeDialogue 동안 spawner step·공격·이동을 모두 건너뛴다. R113은 이 보장에 3초 직접 회귀를 추가했다. | `Automation/test-session.mjs`: firstKill 대화 3초 동안 플레이어 HP와 모든 돼지 위치 deepEqual. |
| D12 reward 순서 | `src/game/session.ts:383-390,505`가 Stan 완료 뒤 epilogue를 pending으로 두고 reward가 confirm/닫기 또는 3초 timeout으로 사라진 다음 scene 이벤트를 낸다. | `Automation/test-session.mjs`: reward 표시 중 scene=`complete`, confirm·3초 두 경로, `reward` sequence 뒤 `scene→epilogue` 순서 통과. |

### worker-claude 브라우저 확인 포인트

1. `/`, `?route=bench`, `?route=final`에서 기존 `runtime-hud`가 보이고 game overlay/door animation이 없으며 final-route·collider 결과가 기존과 같은지 확인한다. `?game=1`에서는 debug HUD가 없고 `?game=1&hud=1`에서만 나타나며 gate 진입 시 dist가 6→9m로 바뀌어야 한다.
2. `?game=1` 로딩 직후 Enter를 즉시 한 번 누르고, 준비 완료 뒤 별도 재입력 없이 create로 정확히 한 번 넘어가는지 확인한다.
3. yaw 0/±90°에서 화면 정면의 Stan/Maya와 돼지에 F/1/2가 맞는지 확인한다. `game-walk.mjs`를 실행할 때 `stanInteractNeededFlip`·`mayaInteractNeededFlip`·`aimExperiment` 같은 보정 결과가 없어야 한다.
4. 아치 중심 `(-1.5,19.8)` 7m 경계 밖/안과 진입 0/0.5/1초를 캡처한다. 두 문이 바깥 힌지에서 0/87.5/100°로 열리고 열린 문틀 중앙을 시각 관통 없이 지나가며, 12m 이탈 1초 뒤 닫혀야 한다.
5. Maya 마지막 Enter를 연타해도 메소가 1,500으로 유지되고 상점 선택지가 먼저 보여야 한다. item 선택과 구매 click 뒤에만 사냥활·메소 600·purchase 이벤트가 생겨야 한다.
6. 첫 처치 대화에서 3초 기다리며 HP와 돼지 위치가 고정인지 확인한다. Stan 완료 뒤 reward와 epilogue 문구가 겹치지 않고, 확인 click 또는 3초 뒤에만 epilogue가 시작되는 두 경로를 각각 확인한다.
7. S00·S03 문 0/0.5/1초·S04·S05 전/후·S07 firstKill·S09 reward·S10 epilogue를 캡처하고 console/shader error 0을 기록한다. D5 돼지 근접 품질, D6 지붕 카메라, D9 title 돼지 선생성, D11 정보성 스케일은 후속 범위로 남긴다.

### R113 CPU 결과

- 파일별 전체 회귀는 **75 files, 454/454 tests PASS**이고 `npx tsc -b`, `npm run lint`, `npm run build`가 모두 exit 0이다. build는 722 modules이며 HEAD 기준과 같은 기본 preload 3개(`input`, `three.core`, `createRenderer`)를 유지해 D1 공용화로 기본 요청을 늘리지 않았다.
- `Automation/run-story.mjs`는 yaw 보정 없이 84.981초, 10/10 처치, 최종 `epilogue`로 완주했다. `final-route`·`colliders`·`input` 개별 회귀도 통과했으며 CPU 지시대로 브라우저는 실행하지 않았다.

## R119 HUD 아이콘·SkillFx 가시성 (2026-08-27)

R119-B는 콘티의 개별 PNG 여덟 장만 128×128 own 파생본으로 줄여 `public/ui/icons/`에 배치했다. 합계는 **92,311 bytes**로 400KB 제한의 23.1%이며, 전체 시트는 배포하지 않는다. `src/game/data/itemIcons.json`을 HUD·인벤토리·상점의 단일 item id 매핑으로 쓰고 `src/data/assets.csv`에 파생 출처와 런타임 파일을 각각 등록했다.

| 사용처 | 런타임 파일 | 크기 | 원본·결정 |
|---|---|---:|---|
| 기본 공격 슬롯 `1` | `/ui/icons/wpn-sword-steel.png` | 7,692 B | Sheet D에 별도 기본공격/베기 셀이 없어 지시된 `wpn-sword-steel` 대체 |
| 전사 스킬 슬롯 `2` | `/ui/icons/skl-flameslash.png` | 29,511 B | Sheet D `skl-flameslash`(불꽃베기) |
| 코인 표시 | `/ui/icons/itm-meso.png` | 17,057 B | `itm-meso`; 표시 문자열 대신 아이콘+숫자, aria label은 own 문구 유지 |
| 나무검 | `/ui/icons/wpn-sword-wooden.png` | 6,211 B | `weapon.wooden-sword` |
| 사냥활 | `/ui/icons/wpn-bow-hunting.png` | 5,166 B | `weapon.hunting-bow` |
| 오크 지팡이 | `/ui/icons/wpn-staff-oak.png` | 4,864 B | `weapon.oak-staff` |
| 철 단검 | `/ui/icons/wpn-dagger-iron.png` | 5,171 B | `weapon.iron-dagger` |
| 돼지 리본 | `/ui/icons/itm-pigribbon.png` | 16,639 B | `head.pig-ribbon` |

### SkillFx 원인·수정·증거

`Automation/fx-probe.mjs`의 수정 전 실측은 Digit2 edge가 세션에 도착하고 MP가 **60→48**, `fx-spawn(flame-slash)`가 발생하며 mesh count **0→2**, atlas **1024×1024 loaded**, console/shader error **0**임을 확인했다. 따라서 입력·MP·atlas 후보는 배제됐다. 실제 원인은 각 quad가 이미 instance matrix로 월드 위치에 놓였는데도 `center` 인스턴스 속성에 같은 월드 좌표를 넣고 `positionLocal.sub(center).mul(life).add(center)`를 적용해, 로컬 vertex에 월드 중심을 중복 적용한 좌표계 오류였다.

`src/shaders/skillFx.ts`는 이제 `positionLocal.mul(life)`로 quad 자체만 축소하고, `fxGeometry.ts`·`SkillFx.tsx`·`LevelUpRing.tsx`에서 `center` 버퍼를 제거했다. `fxInstances.ts`는 컨트롤러 정본 `forwardFromYaw`를 따라 player-front를 전방 **2.0m**, 높이 **1.1m**에 둔다. 불꽃베기 player-front 레이어는 **600ms**, scale **3.6**으로 늘렸고, 기본 공격은 같은 atlas·같은 공유 재질의 `basic-attack` slash 1개를 **650ms**, scale **1.8**로 내보내므로 재질/program 증가는 **0**이다.

- 전 증거: `Docs/qa/fx-probe/before.json`, `before.png` — count 2이나 world `center`가 채워져 slash가 플레이어 뒤에서 변형됨.
- 후 증거: `Docs/qa/fx-probe/after.json`, `after.png` — player `(0,-2.383,24)` 기준 slash `(0,-1.283,22)`, life `0.7863`, `center=null`, atlas loaded, error 0이며 플레이어 앞 붉은 slash가 보인다.
- 헤드리스 story의 `fx-spawn`은 기존 스킬 4회에서 기본 공격을 포함한 **42회**가 됐고 10/10 처치·최종 epilogue·이벤트 순서 위반 0을 유지했다.

### R119 검증 포인트

1. main `?game=1&scene=hunt`에서 공원 HUD 슬롯 `1`에 강철검, `2`에 불꽃베기 아이콘이 보이고 기존 cooldown mask가 아이콘 위에 유지되는지 확인한다. 코인창은 own 문자열을 노출하지 않고 메소 그림+숫자만 보되 스크린리더 이름은 own 모드인지 확인한다.
2. 인벤토리와 상점의 네 무기·돼지 리본 행/상세가 `itemIcons.json`의 같은 128px 파일을 쓰며 깨진 이미지가 0인지 확인한다.
3. 전사 `2` 입력 후 MP가 12 감소하고 플레이어 전방 2m·높이 1.1m에 불꽃 slash가 최소 0.6초 보이는지 측면/후면에서 캡처한다. mesh count·atlas·console도 `fx-probe.mjs`와 같은 값인지 확인한다.
4. 기본 공격 `1`도 같은 위치에 작은 slash 1개가 0.65초 나타나고, 연속 공격에서 동시 FX 상한 30과 최신 3 spawn pool이 유지되는지 확인한다.
5. `/`, `?route=bench`, `?route=final`에서 GameHud·SkillFx가 마운트되지 않고 기존 화면/renderer가 같은지 확인한다. `?game=1` 확인 뒤 console/shader error 0, 새 material/program 0을 기록한다.

CPU 결과는 `npx tsc -b`, `npm run build`(726 modules), `node Automation/check-ip.mjs --src`, 파일별 전체 회귀 **79 files / 494 tests**, `Automation/run-story.mjs`가 모두 exit 0이다. story는 현재 main 결정론 기준 **102.391초·4,685 코인·Lv4·10/10 처치·fx-spawn 42·순서 위반 0**이며, 기존 테스트의 낡은 84.981초/3,785 기대값을 저장 증거와 일치시켰다.
