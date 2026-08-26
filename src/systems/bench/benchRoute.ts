import type { InputState } from '../../player/input'
import type { Vec3 } from '../../player/controllers/types'
import {
  readPlayerFrame,
  readPlayerFrameCount,
  setInputSource,
} from '../../store/playerBridge'

export interface BenchKeyframe {
  time: number
  pose: { position: [number, number, number]; yaw: number }
  input: { forward: number; strafe: number; run: boolean }
}

export interface BenchRoute {
  routeHash: string
  keyframes: BenchKeyframe[]
}

export interface BenchResult {
  routeHash: string
  duration: 60
  sampleCount: number
  finalPosition: Vec3
}

declare global {
  interface Window {
    __bench?: BenchResult | Record<string, unknown>
    __benchMode?: 'bench' | 'manual'
  }
}

export async function loadBenchRoute(): Promise<BenchRoute> {
  const response = await fetch(new URL('./benchRoute.json', import.meta.url))
  if (!response.ok) throw new Error(`bench route load failed: HTTP ${response.status}`)
  const route = (await response.json()) as BenchRoute
  validateBenchRoute(route)
  return route
}

export function validateBenchRoute(route: BenchRoute): void {
  const times = route.keyframes.map((frame) => frame.time)
  if (!route.routeHash || times.length !== 5 || times.join(',') !== '0,15,30,45,60') {
    throw new Error('bench route must contain routeHash and 0/15/30/45/60 keyframes')
  }
}

export function inputAt(route: BenchRoute, elapsedSeconds: number): InputState {
  const clamped = Math.max(0, Math.min(60, elapsedSeconds))
  const nextIndex = route.keyframes.findIndex((frame) => frame.time > clamped)
  const index = nextIndex === -1 ? route.keyframes.length - 2 : Math.max(0, nextIndex - 1)
  const from = route.keyframes[index]
  const to = route.keyframes[index + 1]
  const alpha = (clamped - from.time) / (to.time - from.time)
  return {
    forward: from.input.forward,
    strafe: from.input.strafe,
    run: from.input.run,
    yaw: lerpAngle(from.pose.yaw, to.pose.yaw, alpha),
  }
}

/**
 * 동선을 **화면의 실제 Player** 로 재생한다.
 *
 * 러너는 자기 controller 를 돌리지 않는다. 입력만 공급하고(setInputSource),
 * step() 은 Player 의 useFrame 이 실행한다. 그래서 fps·드로우콜·카메라가 전부
 * 같은 동선 위에서 측정된다. (R12-B 까지는 별도 controller 라 무관했다.)
 */
export async function runBenchRoute(): Promise<BenchResult> {
  const route = await loadBenchRoute()
  const startedAt = performance.now()
  const framesAtStart = readPlayerFrameCount()

  setInputSource(() => inputAt(route, (performance.now() - startedAt) / 1000))

  return new Promise((resolve) => {
    const tick = (now: number) => {
      if ((now - startedAt) / 1000 < 60) {
        requestAnimationFrame(tick)
        return
      }
      setInputSource(null)

      const frame = readPlayerFrame()
      const result: BenchResult = {
        routeHash: route.routeHash,
        duration: 60,
        // Player 가 실제로 그린 프레임 수. 러너 rAF 틱 수가 아니다.
        sampleCount: readPlayerFrameCount() - framesAtStart,
        finalPosition: frame ? { ...frame.position } : { x: NaN, y: NaN, z: NaN },
      }
      window.__bench = result
      console.info(`BENCH_ROUTE ${JSON.stringify(result)}`)
      resolve(result)
    }
    requestAnimationFrame(tick)
  })
}

function lerpAngle(from: number, to: number, alpha: number): number {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * alpha
}
