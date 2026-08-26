import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect } from 'react'
import { createRenderer } from './gl/createRenderer'
import { SkyDome } from './scene/SkyDome'
import { Atmosphere } from './scene/Atmosphere'
import { Lighting } from './scene/Lighting'
import { Prototype } from './scene/Prototype'
import { Terrain } from './scene/Terrain'
import { MainPath } from './scene/MainPath'
import { Foliage } from './scene/Foliage'
import { RockInstances } from './scene/RockInstances'
import { sampleHeight } from './scene/terrain/heightmap'
import { Player } from './player/Controller'
import { RuntimeHud, RuntimeProbe } from './systems/RuntimeHud'
import { CAMERA } from './player/FollowCamera'
import { useRuntime } from './store/useRuntime'
import { reportIfRequested } from './systems/report'
import qualityPresets from './data/quality-presets.json'
import './App.css'

/**
 * M0a-05 — async 렌더러 팩토리를 `<Canvas gl={...}>` 에 주입한다.
 * 계획서.md §2-3 이 "이 패턴의 동작은 M0 최우선 실측 대상"이라고 표시한 지점이다.
 * 실패했다면 Canvas 밖에서 렌더러를 만들어 주입하는 방식으로 내렸을 것이다 — 내리지 않았다.
 */
export default function App() {
  const pushError = useRuntime((s) => s.pushError)
  const preset = useRuntime((s) => s.preset)
  const quality = qualityPresets[preset]
  const width = Math.ceil(quality.renderResolution.width / quality.dprCap)
  const height = Math.ceil(quality.renderResolution.height / quality.dprCap)

  useEffect(() => {
    const onErr = (e: ErrorEvent) => pushError(String(e.message))
    const onRej = (e: PromiseRejectionEvent) => pushError(String(e.reason))
    window.addEventListener('error', onErr)
    window.addEventListener('unhandledrejection', onRej)
    const stop = reportIfRequested()
    return () => {
      window.removeEventListener('error', onErr)
      window.removeEventListener('unhandledrejection', onRej)
      stop()
    }
  }, [pushError])

  return (
    <div className="stage" style={{ width, height }}>
      <Canvas
        gl={createRenderer}
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
        {/* useGLTF 는 suspend 하므로 경계가 필요하다. 로딩 중에는 지형만 보인다. */}
        <Suspense fallback={null}>
          <Foliage sampleHeight={sampleHeight} />
          <RockInstances sampleHeight={sampleHeight} />
        </Suspense>
        <Player />
      </Canvas>
      <RuntimeHud />
    </div>
  )
}
