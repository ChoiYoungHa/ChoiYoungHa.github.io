#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const BUDGET_SOURCE = '계획서 §4-1'
const BUDGETS = Object.freeze({
  low: { calls: 200, tris: 600_000, programs: 40, textureGPU: 300, JSheap: 900 },
  base: { calls: 350, tris: 1_100_000, programs: 56, textureGPU: 550, JSheap: 1_200 },
})
const USAGE = 'usage: node Automation/check-budgets.mjs <perf.json|-> [--preset low|base] [--tris-json <path>]\n'

const { source, trisSource, preset } = parseArgs(process.argv.slice(2))
if (!source) {
  process.stderr.write(USAGE)
  process.exit(2)
}

const raw = source === '-' ? await readStdin() : await readFile(source, 'utf8')
const input = JSON.parse(raw.replace(/^\uFEFF/, ''))
const perf = input.perf ?? input
const limits = BUDGETS[preset]
const trisEstimate = trisSource ? await readTrisEstimate(trisSource, preset) : null
const specs = [
  ['calls', perf.maxCalls, limits.calls, false],
  ['tris', trisEstimate?.value ?? perf.maxTriangles, limits.tris, true],
  ['programs', perf.maxPrograms, limits.programs, false],
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
    const unavailable = typeof value !== 'number' || !Number.isFinite(value)
    const webGpuTrianglesUnsupported = name === 'tris' && (value === 0 || unavailable)
    const unknown = webGpuTrianglesUnsupported || unavailable
    const status = unknown ? 'unknown' : Number(value) <= limit ? 'pass' : 'fail'
    const check = { value: unknown ? '확인 불가' : Number(value), limit, status, allowUnknown }
    if (webGpuTrianglesUnsupported) check.reason = 'WebGPU renderer.info.triangles 미지원'
    return [name, check]
  }),
)
const failed = Object.values(checks).some(
  (check) => check.status === 'fail' || (check.status === 'unknown' && !check.allowUnknown),
)
const warnings = []
if (checks.programs.status === 'pass' && checks.programs.value === checks.programs.limit) {
  warnings.push(`programs is exactly at limit (${checks.programs.value}/${checks.programs.limit})`)
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
  if (args.length === 0) return { source: undefined, trisSource: undefined, preset: 'low' }
  const source = args[0]
  let trisSource
  let preset = 'low'
  let presetSeen = false
  for (let index = 1; index < args.length; index += 1) {
    const option = args[index]
    const value = args[index + 1]
    if (option === '--tris-json' && value && !trisSource) {
      trisSource = value
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
  return { source, trisSource, preset }
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
