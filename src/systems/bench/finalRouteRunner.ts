import type { Vec3 } from '../../player/controllers/types'
import {
  readGroundingStats,
  readIntegratedSeconds,
  readPlayerFrame,
  readPlayerFrameCount,
  setInputSource,
} from '../../store/playerBridge.ts'
import { finalInputAt, validateFinalRoute, verifyFinalRouteHash, type FinalRoute } from './finalRoute'

/**
 * `?route=final` — M4-01 최종 동선(75초·11 waypoint)을 **화면의 실제 Player** 로 재생한다.
 * 구조는 `runBenchRoute` 와 같다(입력만 공급, step 은 Player 의 useFrame). bench 쪽 코드는 손대지 않는다.
 */
export interface FinalRouteResult {
  route: 'final'
  routeId: string
  routeHash: string
  /** 재계산한 hash. 파일값과 다르면 애초에 throw 되므로 결과에 실리면 항상 routeHash 와 같다. */
  routeHashVerified: string
  duration: number
  waypointCount: number
  sampleCount: number
  finalPosition: Vec3
  /** waypoint 시각마다 실제 위치. 어느 waypoint 에서 벗어났는지 종료 위치만으로는 알 수 없다. */
  trace: { t: number; id: string; x: number; z: number }[]
  integratedSeconds: number
  grounding: { ungroundedFrames: number; minY: number }
}

export async function loadFinalRoute(): Promise<FinalRoute> {
  const response = await fetch(new URL('./final-route.json', import.meta.url))
  if (!response.ok) throw new Error(`final route load failed: HTTP ${response.status}`)
  const route = (await response.json()) as FinalRoute
  validateFinalRoute(route)
  await verifyFinalRouteHash(route)
  return route
}

export async function runFinalRoute(): Promise<FinalRouteResult> {
  const route = await loadFinalRoute()
  const duration = route.durationSeconds
  const startedAt = performance.now()
  const framesAtStart = readPlayerFrameCount()
  const secondsAtStart = readIntegratedSeconds()
  const trace: FinalRouteResult['trace'] = []
  // t=0 waypoint 는 시작 직후 첫 틱에서 기록된다.
  let nextWaypoint = 0

  setInputSource(() => finalInputAt(route, (performance.now() - startedAt) / 1000))

  return new Promise((resolve) => {
    const tick = (now: number) => {
      const elapsed = (now - startedAt) / 1000
      while (nextWaypoint < route.waypoints.length && elapsed >= route.waypoints[nextWaypoint].timeSeconds) {
        const w = route.waypoints[nextWaypoint]
        const f = readPlayerFrame()
        trace.push({
          t: w.timeSeconds,
          id: w.id,
          x: f ? Math.round(f.position.x * 100) / 100 : NaN,
          z: f ? Math.round(f.position.z * 100) / 100 : NaN,
        })
        nextWaypoint++
      }
      if (elapsed < duration) {
        requestAnimationFrame(tick)
        return
      }
      setInputSource(null)

      const frame = readPlayerFrame()
      const result: FinalRouteResult = {
        route: 'final',
        routeId: route.id,
        routeHash: route.routeHash,
        routeHashVerified: route.routeHash,
        duration,
        waypointCount: route.waypoints.length,
        sampleCount: readPlayerFrameCount() - framesAtStart,
        finalPosition: frame ? { ...frame.position } : { x: NaN, y: NaN, z: NaN },
        trace,
        integratedSeconds: Math.round((readIntegratedSeconds() - secondsAtStart) * 1000) / 1000,
        grounding: readGroundingStats(),
      }
      window.__bench = { ...result }
      console.info(`FINAL_ROUTE ${JSON.stringify(result)}`)
      resolve(result)
    }
    requestAnimationFrame(tick)
  })
}
