#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { source, trisSource } = parseArgs(process.argv.slice(2))
if (!source) {
  process.stderr.write('usage: node Automation/check-budgets.mjs <perf.json|-> [--tris-json <path>]\n')
  process.exit(2)
}

const raw = source === '-' ? await readStdin() : await readFile(source, 'utf8')
const input = JSON.parse(raw.replace(/^\uFEFF/, ''))
const perf = input.perf ?? input
const trisEstimate = trisSource ? await readTrisEstimate(trisSource) : null
const specs = [
  ['calls', perf.maxCalls, 200, false],
  ['tris', trisEstimate?.value ?? perf.maxTriangles, 600_000, true],
  ['programs', perf.maxPrograms, 40, false],
  ['textureGPU', perf.textureGpuMB, 300, false],
  ['JSheap', perf.jsHeapPeakMB, 900, false],
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
const result = { pass: !failed, checks, warnings }
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
for (const warning of warnings) process.stderr.write(`WARNING: ${warning}\n`)
process.exitCode = failed ? 1 : 0

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function parseArgs(args) {
  if (args.length === 0) return { source: undefined, trisSource: undefined }
  const source = args[0]
  let trisSource
  for (let index = 1; index < args.length; index += 1) {
    if (args[index] !== '--tris-json' || !args[index + 1] || trisSource) {
      process.stderr.write('usage: node Automation/check-budgets.mjs <perf.json|-> [--tris-json <path>]\n')
      process.exit(2)
    }
    trisSource = args[index + 1]
    index += 1
  }
  return { source, trisSource }
}

async function readTrisEstimate(path) {
  const absolutePath = resolve(path)
  const report = JSON.parse((await readFile(absolutePath, 'utf8')).replace(/^\uFEFF/, ''))
  const value = report?.scenarios?.worstCase?.totalTriangles
  if (report?.schema !== 'scene-tris/1' || !Number.isInteger(value) || value < 0) {
    throw new Error(`invalid scene tris report: ${path}`)
  }
  return { value, source: path.replaceAll('\\', '/') }
}
