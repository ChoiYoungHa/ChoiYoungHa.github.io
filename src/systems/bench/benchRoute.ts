import type { InputState } from '../../player/input'
import type { KinematicController, Vec3 } from '../../player/controllers/types'

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

export async function runBenchRoute(controller: KinematicController): Promise<BenchResult> {
  const route = await loadBenchRoute()
  const startedAt = performance.now()
  let previous = startedAt
  let sampleCount = 0

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const elapsed = Math.min(60, (now - startedAt) / 1000)
      const dt = Math.min((now - previous) / 1000, 1 / 20)
      previous = now
      controller.step(inputAt(route, elapsed), dt)
      sampleCount += 1

      if (elapsed < 60) {
        requestAnimationFrame(tick)
        return
      }

      const result: BenchResult = {
        routeHash: route.routeHash,
        duration: 60,
        sampleCount,
        finalPosition: { ...controller.position },
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
