import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { isForcedWebGL, readBackend, type Backend } from '../gl/createRenderer'
import { useRuntime } from '../store/useRuntime'
import { CAMERA } from '../player/FollowCamera'

/**
 * M0a-07 — backend·adapter·ANGLE·preset 을 화면(HUD)과 JSON 으로 동시에 남긴다.
 * 계획서.md §4-3: 성능표에 WebGPU/WebGL2 를 **두 줄로** 기록해야 하므로
 * 어느 백엔드로 돌았는지가 화면에 항상 보여야 한다.
 */

/** Canvas **안**에서 렌더러를 실측해 스토어로 올린다. */
export function RuntimeProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const set = useRuntime((s) => s.set)
  const frames = useRef(0)
  const acc = useRef(0)
  const previousRawCalls = useRef(0)
  const maxFrameCalls = useRef(0)

  // 검증 하네스(systems/report.ts)가 씬 요소 수를 셀 수 있게 노출한다.
  useEffect(() => {
    ;(globalThis as unknown as { __R3F_SCENE__?: unknown }).__R3F_SCENE__ = scene
  }, [scene])

  useEffect(() => {
    window.__R3F_RENDERER__ = gl as unknown as typeof window.__R3F_RENDERER__
    const backend: Backend | 'unknown' = readBackend(gl as never)
    const canvas = gl.domElement
    set({
      backend,
      forceWebGL: isForcedWebGL(),
      canvas: { w: canvas.width, h: canvas.height },
    })

    // adapter / ANGLE 문자열
    void (async () => {
      let adapter = 'n/a'
      try {
        const a = await navigator.gpu?.requestAdapter?.()
        if (a?.info) adapter = `${a.info.vendor ?? '?'} / ${a.info.architecture ?? '?'}`
      } catch {
        /* WebGPU 미지원 환경 */
      }
      let angle = 'n/a'
      try {
        const c = document.createElement('canvas').getContext('webgl2')
        const dbg = c?.getExtension('WEBGL_debug_renderer_info')
        if (c && dbg) angle = String(c.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      } catch {
        /* ignore */
      }
      set({ adapter, angle })
    })()
  }, [gl, set])

  // 계획서 §3-3: 매 프레임이 아니라 **1초 1회** 집계만 올린다.
  useFrame((_, dt) => {
    frames.current += 1
    acc.current += dt
    const info = (
      gl as unknown as {
        info?: { render?: { calls: number; frameCalls?: number; drawCalls?: number } }
      }
    ).info
    const rawCalls = info?.render?.calls ?? 0
    const frameCalls =
      info?.render?.drawCalls ??
      info?.render?.frameCalls ??
      (rawCalls >= previousRawCalls.current ? rawCalls - previousRawCalls.current : rawCalls)
    previousRawCalls.current = rawCalls
    maxFrameCalls.current = Math.max(maxFrameCalls.current, frameCalls)
    if (acc.current >= 1) {
      set({
        fps: Math.round(frames.current / acc.current),
        calls: maxFrameCalls.current,
        triangles: 0,
      })
      frames.current = 0
      acc.current = 0
      maxFrameCalls.current = 0
    }
  })

  return null
}

/** Canvas **밖**에서 값을 읽어 그리는 오버레이. 렌더 루프에 부담을 주지 않는다. */
export function RuntimeHud() {
  const s = useRuntime()
  return (
    <div className="hud" data-testid="runtime-hud">
      <div>
        backend: <b data-testid="hud-backend">{s.backend}</b>
        {s.forceWebGL ? ' (forceWebGL)' : ''}
      </div>
      <div>
        canvas:{' '}
        <b data-testid="hud-canvas">
          {s.canvas.w}×{s.canvas.h}
        </b>
      </div>
      <div>
        preset: <b data-testid="hud-preset">{s.preset}</b>
      </div>
      <div>
        mode: <b data-testid="hud-mode">{window.__benchMode ?? 'manual'}</b>
      </div>
      <div>
        adapter: <span data-testid="hud-adapter">{s.adapter}</span>
      </div>
      <div>
        ANGLE: <span data-testid="hud-angle">{s.angle}</span>
      </div>
      <div>
        fps: <b>{s.fps}</b> · calls: {s.calls} · tris:{' '}
        {s.triangles === 0 ? '확인 불가' : s.triangles}
      </div>
      <div>
        camera:{' '}
        <b data-testid="hud-camera">
          FOV {CAMERA.fov}° · dist {CAMERA.distance}m · h {CAMERA.height}m · pitch{' '}
          {CAMERA.pitchDeg}° · near {CAMERA.near} / far {CAMERA.far}
        </b>
      </div>
      <div className="hud-help">WASD 이동 · Shift 달리기 · 드래그 시선</div>
    </div>
  )
}
