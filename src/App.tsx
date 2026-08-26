import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
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
import { ControlsHint } from './systems/ui/ControlsHint'
import { Settings } from './systems/ui/Settings'
import { LoadingScreen, useLoadingState } from './systems/ui/LoadingScreen'
import { CAMERA } from './player/FollowCamera'
import { useRuntime } from './store/useRuntime'
import { reportIfRequested } from './systems/report'
import qualityPresets from './data/quality-presets.json'
import vistas from './data/vistas.json' with { type: 'json' }
import './App.css'

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
    camera.updateProjectionMatrix()
  }, [camera, id])
  return null
}

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
      <Canvas
        gl={createRenderer}
        flat // M3-14 (R30-A): R3F 기본 톤매퍼(ACES) 주입을 끄고 아래 onCreated 에서 lookdev.json / ?tonemap= 을 적용한다
        onCreated={({ gl }) => applyToneMapping(gl)}
        dpr={quality.dprCap}
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
        {shot ? <VistaCamera id={shot} /> : <Player />}
      </Canvas>
      <RuntimeHud />
      {/* M4-02·M4-05 (R30-A) — 시작 안내 5초·설정. LoadingScreen 은 M4-10 로더 뒤에 마운트한다. shot 모드에는 불필요. */}
      {shot ? null : <ControlsHint />}
      {shot ? null : <Settings onSensitivityChange={setMouseSensitivity} />}
      <LoadingScreen phase={loading.phase} progress={loading.progress} error={loading.error} onRetry={loading.retry} />
    </div>
  )
}
