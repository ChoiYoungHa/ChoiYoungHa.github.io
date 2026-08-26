#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { assertExistingDist, parseBenchArgs } from './run-bench.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNNER = resolve(ROOT, 'Automation', 'run-bench.mjs')
const BUDGET_CHECKER = resolve(ROOT, 'Automation', 'check-budgets.mjs')

test('default policy builds exactly once', () => {
  assert.deepEqual(parseBenchArgs([]), {
    runs: 3,
    warmup: 30,
    gl: undefined,
    soak: undefined,
    output: undefined,
    soakOutput: undefined,
    help: false,
    buildMode: 'once',
  })
})

test('--skip-build selects an existing dist', () => {
  assert.equal(parseBenchArgs(['--skip-build']).buildMode, 'skip')
})

test('--skip-build and --build-once are mutually exclusive', () => {
  assert.throws(
    () => parseBenchArgs(['--skip-build', '--build-once']),
    /--skip-build and --build-once are mutually exclusive/,
  )
})

test('--build-once and --skip-build are mutually exclusive in reverse order', () => {
  assert.throws(
    () => parseBenchArgs(['--build-once', '--skip-build']),
    /--skip-build and --build-once are mutually exclusive/,
  )
})

test('--runs rejects zero', () => {
  assert.throws(() => parseBenchArgs(['--runs', '0']), /--runs must be a positive integer/)
})

test('--warmup rejects negative seconds', () => {
  assert.throws(() => parseBenchArgs(['--warmup', '-1']), /--warmup must be >= 0/)
})

test('--gl rejects unsupported backends', () => {
  assert.throws(() => parseBenchArgs(['--gl', 'webgpu']), /--gl only accepts webgl/)
})

test('--soak rejects zero seconds', () => {
  assert.throws(() => parseBenchArgs(['--soak', '0']), /--soak must be > 0 seconds/)
})

test('value options reject a missing value', () => {
  assert.throws(() => parseBenchArgs(['--output']), /--output requires a value/)
})

test('unknown options are rejected', () => {
  assert.throws(() => parseBenchArgs(['--mystery']), /unknown option: --mystery/)
})

test('--skip-build reports a missing dist as usage exit 2', async () => {
  const missing = resolve(ROOT, `.missing-dist-${randomUUID()}`)
  await assert.rejects(assertExistingDist(missing), (error) => {
    assert.equal(error.exitCode, 2)
    assert.match(error.message, /--skip-build requires an existing dist directory/)
    return true
  })
})

test('--help documents the build policy without starting a benchmark', () => {
  const result = spawnSync(process.execPath, [RUNNER, '--help'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 10_000,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--build-once/)
  assert.match(result.stdout, /--skip-build/)
})

test('WebGPU triangle zero stays allowed unknown with an explicit reason', () => {
  const result = spawnSync(process.execPath, [BUDGET_CHECKER, '-'], {
    cwd: ROOT,
    encoding: 'utf8',
    input: JSON.stringify({
      backend: 'WebGPU',
      maxCalls: 10,
      maxTriangles: 0,
      maxPrograms: 20,
      textureGpuMB: 10,
      jsHeapPeakMB: 10,
    }),
  })

  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).checks.tris, {
    value: '확인 불가',
    limit: 600_000,
    status: 'unknown',
    allowUnknown: true,
    reason: 'WebGPU renderer.info.triangles 미지원',
  })
})

test('an unavailable triangle value also explains the WebGPU limitation', () => {
  const result = spawnSync(process.execPath, [BUDGET_CHECKER, '-'], {
    cwd: ROOT,
    encoding: 'utf8',
    input: JSON.stringify({
      perf: {
        maxCalls: 10,
        maxTriangles: '확인 불가',
        maxPrograms: 20,
        textureGpuMB: 10,
        jsHeapPeakMB: 10,
      },
    }),
  })

  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).checks.tris.reason, 'WebGPU renderer.info.triangles 미지원')
})
