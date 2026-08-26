import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { createRenderer } from './gl/createRenderer'
import { Prototype } from './scene/Prototype'
import { Player } from './player/Controller'
import { RuntimeHud, RuntimeProbe } from './systems/RuntimeHud'
import { CAMERA } from './player/FollowCamera'
import { useRuntime } from './store/useRuntime'
import { reportIfRequested } from './systems/report'
import './App.css'

/**
 * M0a-05 — async 렌더러 팩토리를 `<Canvas gl={...}>` 에 주입한다.
 * 계획서.md §2-3 이 "이 패턴의 동작은 M0 최우선 실측 대상"이라고 표시한 지점이다.
 * 실패했다면 Canvas 밖에서 렌더러를 만들어 주입하는 방식으로 내렸을 것이다 — 내리지 않았다.
 */
export default function App() {
  const pushError = useRuntime((s) => s.pushError)

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
    <div className="stage">
      <Canvas
        gl={createRenderer}
        dpr={1}
        camera={{ fov: CAMERA.fov, near: CAMERA.near, far: CAMERA.far, position: [0, 3, 8] }}
        style={{ width: 1280, height: 720 }}
      >
        <color attach="background" args={['#8fa0b0']} />
        <fogExp2 attach="fog" args={['#8fa0b0', 0.008]} />
        <RuntimeProbe />
        <Prototype />
        <Player />
      </Canvas>
      <RuntimeHud />
    </div>
  )
}
