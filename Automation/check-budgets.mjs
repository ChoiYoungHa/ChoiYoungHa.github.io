#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BUDGET_SOURCE = '계획서 §10 정정 #3 (A 채택, 2026-08-27)'
const BUDGETS = Object.freeze({
  low: { calls: 200, tris: 600_000, pipelines: 48, textureGPU: 300, JSheap: 900 },
  base: { calls: 350, tris: 1_100_000, pipelines: 48, textureGPU: 550, JSheap: 1_200 },
})
const USAGE = 'usage: node Automation/check-budgets.mjs <perf.json|-> [--preset low|base] [--tris-json <path>] [--pipelines-json <path>]\n'

const { source, trisSource, pipelinesSource, preset } = parseArgs(process.argv.slice(2))
if (!source) {
  process.stderr.write(USAGE)
  process.exit(2)
}

const raw = source === '-' ? await readStdin() : await readFile(source, 'utf8')
const input = JSON.parse(raw.replace(/^\uFEFF/, ''))
const perf = input.perf ?? input
const limits = BUDGETS[preset]
const trisEstimate = trisSource ? await readTrisEstimate(trisSource, preset) : null
const pipelinesMeasurement = pipelinesSource
  ? await readPipelinesMeasurement(pipelinesSource)
  : findPipelinesMeasurement(input, perf)
const specs = [
  ['calls', perf.maxCalls, limits.calls, false],
  ['tris', trisEstimate?.value ?? perf.maxTriangles, limits.tris, true],
  ['pipelines', pipelinesMeasurement?.value, limits.pipelines, true],
  ['textureGPU', perf.textureGpuMB, limits.textureGPU, false],
  ['JSheap', perf.jsHeapPeakMB, limits.JSheap, false],
]

const checks = Object.fromEntries(
  specs.map(([name, value, limit, allowUnknown]) => {
    if (name === 'tris' && trisEstimate) {
      return [name, {
        value: trisEstimate.value,
        limit,
        status: trisEstimate.value <= limit ? 'pass' : 'fail',
        allowUnknown,
        method: 'estimated(source)',
        scenario: 'worstCase',
        source: trisEstimate.source,
      }]
    }
    if (name === 'pipelines' && pipelinesMeasurement) {
      return [name, {
        value: pipelinesMeasurement.value,
        limit,
        status: pipelinesMeasurement.value <= limit ? 'pass' : 'fail',
        allowUnknown,
        method: pipelinesMeasurement.method,
        source: pipelinesMeasurement.source,
      }]
    }
    const unavailable = typeof value !== 'number' || !Number.isFinite(value)
    const webGpuTrianglesUnsupported = name === 'tris' && (value === 0 || unavailable)
    const pipelinesUnavailable = name === 'pipelines' && unavailable
    const unknown = webGpuTrianglesUnsupported || pipelinesUnavailable || unavailable
    const status = unknown ? 'unknown' : Number(value) <= limit ? 'pass' : 'fail'
    const unknownValue = name === 'pipelines' ? '측정값 없음' : '확인 불가'
    const check = { value: unknown ? unknownValue : Number(value), limit, status, allowUnknown }
    if (webGpuTrianglesUnsupported) check.reason = 'WebGPU renderer.info.triangles 미지원'
    if (pipelinesUnavailable) check.reason = '측정값 없음 = 판정 보류'
    return [name, check]
  }),
)
const programs = finiteNumber(perf.maxPrograms ?? input.maxPrograms ?? input.peak?.infoPrograms)
checks.programs = {
  value: programs ?? '측정값 없음',
  status: 'reference',
  evaluated: false,
  reason: '참고값(예산 판정 제외)',
}
const failed = Object.values(checks).some(
  (check) => check.status === 'fail' || (check.status === 'unknown' && !check.allowUnknown),
)
const warnings = []
if (checks.pipelines.status === 'pass' && checks.pipelines.value === checks.pipelines.limit) {
  warnings.push(`pipelines is exactly at limit (${checks.pipelines.value}/${checks.pipelines.limit})`)
}
const result = { pass: !failed, preset, source: BUDGET_SOURCE, checks, warnings }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
for (const warning of warnings) process.stderr.write(`WARNING: ${warning}\n`)
process.exitCode = failed ? 1 : 0

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function parseArgs(args) {
  if (args.length === 0) {
    return { source: undefined, trisSource: undefined, pipelinesSource: undefined, preset: 'low' }
  }
  const source = args[0]
  let trisSource
  let pipelinesSource
  let preset = 'low'
  let presetSeen = false
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]
    const value = args[index + 1]
    if (option === '--tris-json' && value && !trisSource) {
      trisSource = value
      index += 1
    } else if (option === '--pipelines-json' && value && !pipelinesSource) {
      pipelinesSource = value
      index += 1
    } else if (option === '--preset' && (value === 'low' || value === 'base') && !presetSeen) {
      preset = value
      presetSeen = true
      index += 1
    } else {
      process.stderr.write(USAGE)
      process.exit(2)
    }
  }
  return { source, trisSource, pipelinesSource, preset }
}

async function readTrisEstimate(path, preset) {
  const absolutePath = resolve(path)
  const report = JSON.parse((await readFile(absolutePath, 'utf8')).replace(/^\uFEFF/, ''))
  const value = report?.scenarios?.worstCase?.totalTriangles
  if (report?.schema !== 'scene-tris/1' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid scene tris report: ${path}`)
  }
  if (report.preset !== preset) {
    throw new Error(`scene tris preset mismatch: report=${report.preset} checker=${preset}`)
  }
  return { value, source: path.replaceAll('\\', '/') }
}

async function readPipelinesMeasurement(path) {
  const absolutePath = resolve(path)
  const report = JSON.parse((await readFile(absolutePath, 'utf8')).replace(/^\uFEFF/, ''))
  const value = finiteNumber(
    report?.peak?.pipelines
      ?? report?.pipelines
      ?? report?.maxPipelines
      ?? report?.perf?.maxPipelines,
  )
  if (value === undefined || value < 0) {
    throw new Error(`invalid pipelines report: ${path}`)
  }
  return {
    value,
    method: 'measured(probe)',
    source: path.replaceAll('\\', '/'),
  }
}

function findPipelinesMeasurement(input, perf) {
  const candidates = [
    ['perf.maxPipelines', perf?.maxPipelines],
    ['perf.pipelines', perf?.pipelines],
    ['maxPipelines', input?.maxPipelines],
    ['pipelines', input?.pipelines],
    ['peak.pipelines', input?.peak?.pipelines],
  ]
  for (const [source, candidate] of candidates) {
    const value = finiteNumber(candidate)
    if (value !== undefined && value >= 0) {
      return { value, method: 'measured(input)', source }
    }
  }
  return null
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value) : undefined
}
