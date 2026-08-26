import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { createRenderer } from './gl/createRenderer'
import { Prototype } from './scene/Prototype'
import { Terrain } from './scene/Terrain'
import { MainPath } from './scene/MainPath'
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
        <color attach="background" args={['#8fa0b0']} />
        <fogExp2 attach="fog" args={['#8fa0b0', quality.fogDensity]} />
        <RuntimeProbe />
        <Prototype shadowMapResolution={quality.shadowCascades.resolution} />
        <Terrain />
        <MainPath />
        <Player />
      </Canvas>
      <RuntimeHud />
    </div>
  )
}
