import { Canvas, useThree } from '@react-three/fiber'
import { lazy, memo, Suspense, useEffect } from 'react'
import { applyToneMapping, createRenderer } from './gl/createRenderer'
import { SkyDome } from './scene/SkyDome'
import { Atmosphere } from './scene/Atmosphere'
import { Lighting } from './scene/Lighting'
import { Prototype } from './scene/Prototype'
import { Terrain } from './scene/Terrain'
import { MainPath } from './scene/MainPath'
import { HeroTree } from './scene/HeroTree'
import { Village } from './scene/Village'
import { Foliage } from './scene/Foliage'
import { RockInstances } from './scene/RockInstances'
import { sampleHeight } from './scene/terrain/heightmap'
import { Player, setMouseSensitivity } from './player/Controller'
import { RuntimeHud, RuntimeProbe } from './systems/RuntimeHud'
import { shouldShowRuntimeHud } from './systems/runtimeHudGate'
import { ControlsHint } from './systems/ui/ControlsHint'
import { Settings } from './systems/ui/Settings'
import { LoadingScreen, useLoadingState } from './systems/ui/LoadingScreen'
import { GAME_INPUT_ENABLED } from './player/input'
import { CAMERA } from './player/FollowCamera'
import { useRuntime } from './store/useRuntime'
import { reportIfRequested } from './systems/report'
import qualityPresets from './data/quality-presets.json'
import vistas from './data/vistas.json' with { type: 'json' }
import './App.css'

const GameRuntime = lazy(() => import('./scene/GameRuntime'))
const GameOverlay = lazy(() => import('./systems/ui/GameOverlay'))

/**
 * M0a-05 — async 렌더러 팩토리를 `<Canvas gl={...}>` 에 주입한다.
 * 계획서.md §2-3 이 "이 패턴의 동작은 M0 최우선 실측 대상"이라고 표시한 지점이다.
 * 실패했다면 Canvas 밖에서 렌더러를 만들어 주입하는 방식으로 내렸을 것이다 — 내리지 않았다.
 */
/**
 * 계획서 §6-4 고정 캡처 — `?shot=<vista id>` 이면 플레이어 대신 vista 에 카메라를 고정한다.
 * 룩 비교는 같은 지점·같은 시선에서 찍어야 의미가 있다.
 */
function VistaCamera({ id }: { id: string }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const m = vistas.markers.find((v) => v.id === id)
    if (!m) return
    const eye = vistas.eyeHeightMeters
    camera.position.set(m.position.x, sampleHeight(m.position.x, m.position.z) + eye, m.position.z)
    camera.lookAt(m.target.x, sampleHeight(m.target.x, m.target.z) + eye, m.target.z)
    // R52-A: 선택 필드 pitchDeg — lookAt 시선에서 추가로 올려보는 각(+ = 위). 부재·0 이면 기존 동작 그대로.
    // R57-A(master 승인): `?vistaPitch=<deg>` 가 있으면 우선(lookdev-variants 러너용). raw null 을 먼저 걸러 Number(null)=0 함정을 피한다.
    const q = new URLSearchParams(location.search).get('vistaPitch')
    const pitchDeg = q !== null && Number.isFinite(Number(q)) ? Number(q) : 'pitchDeg' in m && typeof m.pitchDeg === 'number' ? m.pitchDeg : 0
    if (pitchDeg !== 0) camera.rotateX((pitchDeg * Math.PI) / 180)
    camera.updateProjectionMatrix()
  }, [camera, id])
  return null
}

/**
 * R86-A — 씬 캔버스. **로딩 상태와 분리된 memo 컴포넌트**라 props(전부 원시값)가 같으면 재렌더되지 않는다.
 * App 이 로딩 progress 마다 재렌더되면 R3F Canvas 의 레이아웃 이펙트(deps 없음)가 매번 root.configure() 를 다시 불러
 * async gl 팩토리(createRenderer)를 16회 재호출했다(R86-A 실측). configure 의 if (!state.gl) 가드는 await 중 재진입을
 * 못 막아 두 번째 WebGPURenderer 가 같은 캔버스에 생기고, store 의 최종 gl 은 setSize 를 못 받아 canvasTarget 300×150 →
 * 매 프레임 depth 검증 에러·검은 프레임(R77-A 결함). 구 빌드는 로딩 ready 뒤에 Canvas 가 마운트되는 타이밍이라 1회였다.
 * 상세: Docs/decisions/webgpu-blackframe-r86.md
 */
const Stage = memo(function Stage({ width, height, shot, hideHero, dprCap }: { width: number; height: number; shot: string | null; hideHero: boolean; dprCap: number }) {
  return (
    <Canvas
      gl={createRenderer}
      flat // M3-14 (R30-A): R3F 기본 톤매퍼(ACES) 주입을 끄고 아래 onCreated 에서 lookdev.json / ?tonemap= 을 적용한다
      onCreated={({ gl }) => applyToneMapping(gl)}
      dpr={dprCap}
      shadows
      camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: [0, 3, 8] }}
      style={{ width, height }}
    >
      {/* R18-A 통합 순서: SkyDome → Atmosphere → Lighting → 지오메트리.
          App 이 직접 들고 있던 배경색·안개·방향광은 이 셋과 **중복**이라 제거했다.
          배경·환경맵은 SkyDome 이 scene.background/environment 로 설정한다. */}
      <SkyDome />
      <Atmosphere />
      <Lighting />
      <RuntimeProbe />
      <Prototype />
      <Terrain />
      <MainPath />
      {hideHero ? null : <HeroTree />}
      {/* M2-24 마을 8채. 지오메트리를 코드로 만들고 InstancedMesh 로 그린다 — suspend 하지 않으므로
          Foliage/RockInstances 의 Suspense 경계 밖에 둔다(로딩 중에도 마을은 보인다). */}
      <Village />
      {/* useGLTF 는 suspend 하므로 경계가 필요하다. 로딩 중에는 지형만 보인다. */}
      <Suspense fallback={null}>
        <Foliage sampleHeight={sampleHeight} />
        <RockInstances sampleHeight={sampleHeight} />
      </Suspense>
      {shot ? <VistaCamera id={shot} /> : <><Player />{GAME_INPUT_ENABLED ? <Suspense fallback={null}><GameRuntime /></Suspense> : null}</>}
    </Canvas>
  )
})

export default function App() {
  const params = new URLSearchParams(location.search)
  const shot = params.get('shot')
  // 룩디브 before/after 용(계획서 §6-4). 실루엣 검사는 이 두 장의 차분으로 나무 픽셀을 정확히 분리한다.
  const hideHero = params.get('hideHero') === '1'
  const pushError = useRuntime((s) => s.pushError)
  const preset = useRuntime((s) => s.preset)
  const quality = qualityPresets[preset]
  const loading = useLoadingState()
  const width = Math.ceil(quality.renderResolution.width / quality.dprCap)
  const height = Math.ceil(quality.renderResolution.height / quality.dprCap)

  useEffect(() => {
    const onErr = (e: ErrorEvent) => pushError(String(e.message))
    const onRej = (e: PromiseRejectionEvent) => pushError(String(e.reason))
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    // shot 모드는 HDR·GLB 로드와 프레임 누적을 기다려야 캔버스가 비어 있지 않다(실측: 4초는 이르다).
    const stop = reportIfRequested(shot ? 12000 : undefined)
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      stop()
    }
  }, [pushError, shot])

  return (
    <div className="stage" style={{ width, height }}>
      <Stage width={width} height={height} shot={shot} hideHero={hideHero} dprCap={quality.dprCap} />
      {shouldShowRuntimeHud(location.search, GAME_INPUT_ENABLED) ? <RuntimeHud /> : null}
      {!shot && GAME_INPUT_ENABLED ? <Suspense fallback={null}><GameOverlay loading={loading} preset={preset} /></Suspense> : null}
      {/* M4-02·M4-05 (R30-A) — 시작 안내 5초·설정. LoadingScreen 은 M4-10 로더 뒤에 마운트한다. shot 모드에는 불필요. */}
      {/* R48-A: 로딩 ready 뒤에 마운트 — 5초 타이머 시작점 = ready(로드 중 메인 스레드 정지 구간을 피한다) */}
      {shot || loading.phase !== 'ready' ? null : <ControlsHint />}
      {shot ? null : <Settings onSensitivityChange={setMouseSensitivity} />}
      <LoadingScreen phase={loading.phase} progress={loading.progress} error={loading.error} onRetry={loading.retry} />
    </div>
  )
}
