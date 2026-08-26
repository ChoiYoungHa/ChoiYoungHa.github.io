import type { InputState } from '../../player/input'

/**
 * M4-01 최종 동선(`final-route.json`, worker-codex 산출)을 재생하기 위한 **순수 로직**.
 *
 * - three·React·playerBridge 를 import 하지 않는다 → Node 에서 결정론 테스트 가능(`Automation/test-final-route.mjs`).
 * - `?route=bench`(benchRoute.ts, 60초·5키프레임·M3-GATE 재현성)와는 **완전히 분리**된다.
 *   validateBenchRoute·routeHash·CSV 스키마는 건드리지 않는다.
 * - 브라우저 재생은 `finalRouteRunner.ts` 가 맡는다.
 */

export interface FinalRouteWaypoint {
  id: string
  timeSeconds: number
  label?: string
  sourceMainPathIndex?: number
  pose: { position: [number, number, number]; yaw: number }
  input: { forward: number; run: boolean }
}

export interface FinalRoute {
  routeHash: string
  routeHashMethod?: string
  id: string
  durationSeconds: number
  waypoints: FinalRouteWaypoint[]
  [extra: string]: unknown
}

/** 로드맵 M4-01 완료 조건: duration 60~90초 · waypoint ≥ 8 · route hash 존재. */
export const FINAL_ROUTE_RULES = { minDuration: 60, maxDuration: 90, minWaypoints: 8, hashHexLength: 12 } as const

/**
 * `validateBenchRoute` 와 별도 함수(그 파일은 worker-codex 소유·M3-GATE 재현성 보호).
 * 여기서는 **구조**만 검사한다. hash 재계산은 비동기(SubtleCrypto)라 `verifyFinalRouteHash` 로 분리했다.
 */
export function validateFinalRoute(route: FinalRoute): void {
  const { minDuration, maxDuration, minWaypoints, hashHexLength } = FINAL_ROUTE_RULES
  if (typeof route.routeHash !== 'string' || !new RegExp(`^[0-9a-f]{${hashHexLength}}$`).test(route.routeHash)) {
    throw new Error(`final route: routeHash must be ${hashHexLength} lowercase hex chars`)
  }
  if (!Array.isArray(route.waypoints) || route.waypoints.length < minWaypoints) {
    throw new Error(`final route: waypoints must be >= ${minWaypoints}`)
  }
  const d = route.durationSeconds
  if (!Number.isFinite(d) || d < minDuration || d > maxDuration) {
    throw new Error(`final route: durationSeconds must be ${minDuration}~${maxDuration}`)
  }
  const times = route.waypoints.map((w) => w.timeSeconds)
  if (times[0] !== 0) throw new Error('final route: first waypoint must be at t=0')
  if (times[times.length - 1] !== d) throw new Error('final route: last waypoint must be at t=durationSeconds')
  for (let i = 1; i < times.length; i++) {
    if (!(times[i] > times[i - 1])) throw new Error(`final route: timeSeconds not strictly increasing at index ${i}`)
  }
  for (const w of route.waypoints) {
    const p = w.pose?.position
    if (!p || p.length !== 3 || p.some((v) => !Number.isFinite(v)) || !Number.isFinite(w.pose.yaw)) {
      throw new Error(`final route: bad pose at waypoint ${w.id}`)
    }
    if (!Number.isFinite(w.input?.forward) || typeof w.input?.run !== 'boolean') {
      throw new Error(`final route: bad input at waypoint ${w.id}`)
    }
  }
}

/**
 * hash 입력 문자열 — `routeHashMethod` 정의 그대로: routeHash·routeHashMethod 를 뺀 문서 전체를
 * **키 순서 유지·compact** JSON.stringify 한 UTF-8.
 */
export function canonicalFinalRouteJson(route: FinalRoute): string {
  const { routeHash: _h, routeHashMethod: _m, ...rest } = route
  void _h
  void _m
  return JSON.stringify(rest)
}

/** SHA-256 앞 12자(소문자 hex). 브라우저·Node 22+ 모두 `globalThis.crypto.subtle` 로 동작한다. */
export async function computeFinalRouteHash(route: FinalRoute): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalFinalRouteJson(route))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, FINAL_ROUTE_RULES.hashHexLength)
}

/** 파일의 routeHash 와 재계산값이 다르면 throw — 변조·수정 후 hash 미갱신을 잡는다. */
export async function verifyFinalRouteHash(route: FinalRoute): Promise<string> {
  const computed = await computeFinalRouteHash(route)
  if (computed !== route.routeHash) {
    throw new Error(`final route hash mismatch: file ${route.routeHash} / computed ${computed}`)
  }
  return computed
}

/**
 * 경과 시간 → InputState. 구간 시작 waypoint 의 forward/run 을 쓰고 yaw 는 다음 waypoint 로 선형 보간(최단 각).
 * bench 의 `inputAt` 과 같은 규칙이되 strafe 는 final-route 에 없으므로 0.
 */
export function finalInputAt(route: FinalRoute, elapsedSeconds: number): InputState {
  const wps = route.waypoints
  const clamped = Math.max(0, Math.min(route.durationSeconds, elapsedSeconds))
  const nextIndex = wps.findIndex((w) => w.timeSeconds > clamped)
  const index = nextIndex === -1 ? wps.length - 2 : Math.max(0, nextIndex - 1)
  const from = wps[index]
  const to = wps[index + 1]
  const alpha = (clamped - from.timeSeconds) / (to.timeSeconds - from.timeSeconds)
  return {
    forward: from.input.forward,
    strafe: 0,
    run: from.input.run,
    yaw: lerpAngle(from.pose.yaw, to.pose.yaw, Math.max(0, Math.min(1, alpha))),
  }
}

export function lerpAngle(from: number, to: number, alpha: number): number {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * alpha
}
