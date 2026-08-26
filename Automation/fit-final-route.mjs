#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { createRaycastController } from '../src/player/controllers/raycast.ts'
import { sampleGround } from '../src/scene/terrain/heightmap.ts'
import {
  heroTreeCollider,
  PLAYER_RADIUS,
  resolveCollision,
} from '../src/scene/colliders/heroTree.ts'
import { resolveVillageCollision } from '../src/scene/colliders/village.ts'
import { finalInputAt } from '../src/systems/bench/finalRoute.ts'
import placement from '../src/data/placement.json' with { type: 'json' }

const DT = 1 / 60
const MAX_WAYPOINT_DEVIATION = 2
// R100-A: GLB 수목 발자국 반경 8.0m(colliders/heroTree.ts) + 1.5m 정지 여유 = 9.5m 목표(허용 9~10).
const MIN_HERO_DISTANCE = 9
const MAX_HERO_DISTANCE = 10
const FIT_WAYPOINT_LAST_INDEX = 8
const FIT_VARIABLES = [0, 2, 3, 4, 5, 6, 7]
const FIT_STEPS = [0.6, 0.3, 0.15, 0.075, 0.03, 0.012, 0.005, 0.002, 0.001, 0.0004]

const options = parseArgs(process.argv.slice(2))
const root = process.cwd()
const routePath = resolve(root, options.route)
const sourceRoute = JSON.parse(await readFile(routePath, 'utf8'))

if (options.formatOnly) {
  const outPath = resolve(root, options.out)
  await writeFile(outPath, serializeRoute(sourceRoute), 'utf8')
  process.stdout.write(`${JSON.stringify({ mode: 'format-only', output: repoPath(outPath) })}\n`)
} else if (options.verify) {
  const trace = simulateRoute(sourceRoute)
  const result = judge(sourceRoute, trace)
  process.stdout.write(`${JSON.stringify({ mode: 'verify', routeHash: sourceRoute.routeHash, ...result, trace }, null, 2)}\n`)
  if (!result.pass) process.exitCode = 1
} else {
  const before = simulateRoute(sourceRoute)
  const fittedRoute = fitRoute(sourceRoute)
  const after = simulateRoute(fittedRoute)
  const result = judge(fittedRoute, after)
  if (!result.pass) {
    throw new Error(`fit failed: max deviation ${result.maxDeviationMeters}m, final hero distance ${result.finalHeroCenterDistanceMeters}m`)
  }

  fittedRoute.routeHash = computeRouteHash(fittedRoute)
  const outPath = resolve(root, options.out)
  await writeFile(outPath, serializeRoute(fittedRoute), 'utf8')

  const browserRun = await readOptionalJson(resolve(root, options.browserRun))
  const reportPath = resolve(root, options.report)
  await writeFile(reportPath, renderReport({ sourceRoute, fittedRoute, before, after, result, browserRun }), 'utf8')

  process.stdout.write(`${JSON.stringify({
    mode: 'fit',
    input: repoPath(routePath),
    output: repoPath(outPath),
    report: repoPath(reportPath),
    dt: DT,
    beforeMaxDeviationMeters: maxDeviation(before),
    afterMaxDeviationMeters: result.maxDeviationMeters,
    finalDeviationMeters: result.finalDeviationMeters,
    finalHeroCenterDistanceMeters: result.finalHeroCenterDistanceMeters,
    routeHash: fittedRoute.routeHash,
    pass: result.pass,
  }, null, 2)}\n`)
}

export function fitRoute(route) {
  const fitted = structuredClone(route)
  const yaws = fitted.waypoints.slice(0, 8).map((waypoint) => waypoint.pose.yaw)
  const firstPairSum = yaws[0] + yaws[1]
  let bestScore = score(fitted, yaws)

  for (const step of FIT_STEPS) {
    let changed = true
    let rounds = 0
    while (changed && rounds < 5) {
      changed = false
      rounds += 1
      for (const variable of FIT_VARIABLES) {
        let bestCandidate = yaws
        let candidateScore = bestScore
        for (const direction of [-1, 1]) {
          const candidate = [...yaws]
          if (variable === 0) {
            candidate[0] += direction * step
            candidate[1] = firstPairSum - candidate[0]
          } else {
            candidate[variable] += direction * step
          }
          const nextScore = score(fitted, candidate)
          if (nextScore < candidateScore) {
            bestCandidate = candidate
            candidateScore = nextScore
          }
        }
        if (candidateScore < bestScore) {
          yaws.splice(0, yaws.length, ...bestCandidate)
          bestScore = candidateScore
          changed = true
        }
      }
    }
  }

  for (let index = 0; index < yaws.length; index += 1) {
    fitted.waypoints[index].pose.yaw = round(yaws[index], 6)
  }
  // hero-approach 뒤에는 forward=0이다. 감속 중 카메라가 튀지 않도록 첫 정지 pose도 같은 yaw로 시작한다.
  fitted.waypoints[FIT_WAYPOINT_LAST_INDEX].pose.yaw = fitted.waypoints[FIT_WAYPOINT_LAST_INDEX - 1].pose.yaw
  return fitted
}

export function simulateRoute(route, untilSeconds = route.durationSeconds) {
  const resolver = (position) => resolveVillageCollision(
    resolveCollision(position, [heroTreeCollider(placement.heroTree)]),
    PLAYER_RADIUS,
  )
  const start = route.waypoints[0].pose.position
  const controller = createRaycastController(sampleGround, { x: start[0], y: start[1], z: start[2] }, {}, resolver)
  const trace = []
  let nextWaypoint = 0
  const steps = Math.round(untilSeconds / DT)

  for (let step = 0; step <= steps; step += 1) {
    const elapsed = step * DT
    while (
      nextWaypoint < route.waypoints.length
      && route.waypoints[nextWaypoint].timeSeconds <= untilSeconds
      && elapsed + 1e-9 >= route.waypoints[nextWaypoint].timeSeconds
    ) {
      const waypoint = route.waypoints[nextWaypoint]
      const position = controller.position
      trace.push({
        id: waypoint.id,
        timeSeconds: waypoint.timeSeconds,
        target: { x: waypoint.pose.position[0], z: waypoint.pose.position[2] },
        actual: { x: round(position.x), z: round(position.z) },
        deviationMeters: round(Math.hypot(position.x - waypoint.pose.position[0], position.z - waypoint.pose.position[2])),
      })
      nextWaypoint += 1
    }
    if (step < steps) controller.step(finalInputAt(route, elapsed), DT)
  }
  return trace
}

function score(route, yaws) {
  const candidate = structuredClone(route)
  for (let index = 0; index < yaws.length; index += 1) candidate.waypoints[index].pose.yaw = yaws[index]
  candidate.waypoints[FIT_WAYPOINT_LAST_INDEX].pose.yaw = yaws[FIT_WAYPOINT_LAST_INDEX - 1]
  return simulateRoute(candidate, candidate.waypoints[FIT_WAYPOINT_LAST_INDEX].timeSeconds)
    .filter((point) => point.timeSeconds > 0)
    .reduce((total, point, index) => {
      const waypointIndex = index + 1
      const weight = waypointIndex >= FIT_WAYPOINT_LAST_INDEX - 1 ? 3 : 1
      return total + point.deviationMeters ** 2 * weight
    }, 0)
}

function judge(route, trace) {
  const deviations = trace.map((point) => point.deviationMeters)
  const final = trace.at(-1)
  const center = route.heroTreeSafety.center
  const finalHeroDistance = Math.hypot(final.actual.x - center[0], final.actual.z - center[1])
  const maxDev = Math.max(...deviations)
  const pass = maxDev <= MAX_WAYPOINT_DEVIATION
    && final.deviationMeters <= MAX_WAYPOINT_DEVIATION
    && finalHeroDistance >= MIN_HERO_DISTANCE
    && finalHeroDistance <= MAX_HERO_DISTANCE
    && route.durationSeconds >= 60
    && route.durationSeconds <= 90
    && route.waypoints.length >= 8
  return {
    pass,
    maxDeviationMeters: round(maxDev),
    finalDeviationMeters: final.deviationMeters,
    finalHeroCenterDistanceMeters: round(finalHeroDistance),
    durationSeconds: route.durationSeconds,
    waypointCount: route.waypoints.length,
  }
}

function computeRouteHash(route) {
  const { routeHash: _hash, routeHashMethod: _method, ...rest } = route
  void _hash
  void _method
  return createHash('sha256').update(JSON.stringify(rest), 'utf8').digest('hex').slice(0, 12)
}

function renderReport({ sourceRoute, fittedRoute, before, after, result, browserRun }) {
  const browserById = new Map((browserRun?.trace ?? []).map((point) => [point.id, point]))
  const beforeById = new Map(before.map((point) => [point.id, point]))
  const rows = after.map((point) => {
    const old = beforeById.get(point.id)
    const browser = browserById.get(point.id)
    return `| ${point.id} | ${browser?.devFromWaypointM ?? '—'} | ${old?.deviationMeters ?? '—'} | ${point.deviationMeters} | (${point.actual.x}, ${point.actual.z}) |`
  })
  return `# M4 final route 자동 적합 (R71-B)\n\n`
    + `## 판정\n\n`
    + `- 결과: **${result.pass ? 'PASS' : 'FAIL'}**\n`
    + `- 고정 조건: dt \`1/60\`, duration \`${result.durationSeconds}s\`, waypoint \`${result.waypointCount}\`개, waypoint 시각·position·input 불변\n`
    + `- 적합 변수: 이동 구간 pose.yaw. 첫 2.5초 중간 yaw는 기존 회귀 단언을 보존하고, 좌표하강 step \`${FIT_STEPS.join(' → ')}\`를 고정했다.\n`
    + `- 최종 routeHash: \`${fittedRoute.routeHash}\` (\`finalRoute.ts\`와 같은 routeHash·routeHashMethod 제외 compact JSON SHA-256 앞 12자)\n`
    + `- 최대 waypoint 편차: \`${result.maxDeviationMeters}m\` (한도 ${MAX_WAYPOINT_DEVIATION}m)\n`
    + `- 최종 hero-approach 편차: \`${result.finalDeviationMeters}m\`; 밑동 중심거리: \`${result.finalHeroCenterDistanceMeters}m\` (허용 ${MIN_HERO_DISTANCE}~${MAX_HERO_DISTANCE}m)\n\n`
    + `## 전/후 편차\n\n`
    + `R69-A 브라우저 값은 \`Docs/qa/m4-final-route-run.json\`, Node 전/후는 아래 재사용 경로를 dt 1/60으로 실행한 값이다.\n\n`
    + `| waypoint | R69 브라우저 전(m) | Node 전(m) | Node 후(m) | Node 후 actual x,z |\n`
    + `|---|---:|---:|---:|---|\n${rows.join('\n')}\n\n`
    + `## 시뮬 재사용 경로\n\n`
    + `1. \`src/player/controllers/raycast.ts\`의 \`createRaycastController\`와 \`src/scene/terrain/heightmap.ts\`의 \`sampleGround\`를 직접 실행한다.\n`
    + `2. \`Controller.tsx\`와 같은 순서로 hero 원 충돌(\`heroTree.ts\`) 뒤 village 박스 충돌(\`village.ts\`)을 합성한다.\n`
    + `3. \`src/systems/bench/finalRoute.ts\`의 \`finalInputAt\`을 매 1/60초 적용한다. 이는 \`Docs/qa/m2-route.csv\`의 M2-31 Node 결정론 시뮬 방법과 같다.\n\n`
    + `## 변경과 남은 확인\n\n`
    + `- routeHash \`${sourceRoute.routeHash}\` → \`${fittedRoute.routeHash}\`; waypoint 시간 \`[${fittedRoute.waypoints.map((point) => point.timeSeconds).join(', ')}]\`은 유지했다.\n`
    + `- 관통·낙하 회귀는 실제 충돌 resolver·heightmap을 통과하는 Node 시뮬 구조로 방지했다.\n`
    + `- 브라우저 실주행 재확인은 worker-claude R72-A에서 수행한다.\n`
}

function parseArgs(args) {
  const result = {
    route: 'src/systems/bench/final-route.json',
    out: 'src/systems/bench/final-route.json',
    report: 'Docs/qa/m4-final-route-fit.md',
    browserRun: 'Docs/qa/m4-final-route-run.json',
    verify: false,
    formatOnly: false,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--verify') result.verify = true
    else if (arg === '--format-only') result.formatOnly = true
    else if (['--route', '--out', '--report', '--browser-run'].includes(arg)) {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a path`)
      const key = arg === '--browser-run' ? 'browserRun' : arg.slice(2)
      result[key] = value
      index += 1
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return result
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function maxDeviation(trace) {
  return round(Math.max(...trace.map((point) => point.deviationMeters)))
}

function serializeRoute(route) {
  return `${JSON.stringify(route, null, 2)
    .replace(
      /"center": \[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/,
      '"center": [$1, $2]',
    )
    .replace('"minimumCenterDistanceMeters": 3,', '"minimumCenterDistanceMeters": 3.0,')
    .replace(
      /"pose": \{\n\s+"position": \[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\],\n\s+"yaw": (-?[\d.]+)\n\s+\}/g,
      '"pose": { "position": [$1, $2, $3], "yaw": $4 }',
    )
    .replace(
      /"input": \{\n\s+"forward": (-?[\d.]+),\n\s+"run": (true|false)\n\s+\}/g,
      '"input": { "forward": $1, "run": $2 }',
    )}\n`
}

function round(value, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function repoPath(path) {
  return relative(root, path).replaceAll('\\', '/')
}
