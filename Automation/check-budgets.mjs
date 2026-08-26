#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const source = process.argv[2]
if (!source) {
  process.stderr.write('usage: node Automation/check-budgets.mjs <perf.json|->\n')
  process.exit(2)
}

const raw = source === '-' ? await readStdin() : await readFile(source, 'utf8')
const input = JSON.parse(raw.replace(/^\uFEFF/, ''))
const perf = input.perf ?? input
const specs = [
  ['calls', perf.maxCalls, 200, false],
  ['tris', perf.maxTriangles, 600_000, true],
  ['programs', perf.maxPrograms, 40, false],
  ['textureGPU', perf.textureGpuMB, 300, false],
  ['JSheap', perf.jsHeapPeakMB, 900, false],
]

const checks = Object.fromEntries(
  specs.map(([name, value, limit, allowUnknown]) => {
    const unknown = typeof value !== 'number' || !Number.isFinite(value)
    const status = unknown ? 'unknown' : Number(value) <= limit ? 'pass' : 'fail'
    return [name, { value: unknown ? '확인 불가' : Number(value), limit, status, allowUnknown }]
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
