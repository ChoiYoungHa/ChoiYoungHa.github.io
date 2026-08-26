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
