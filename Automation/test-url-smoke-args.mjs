#!/usr/bin/env node

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { makeSmokeUrl, parseUrlSmokeArgs } from './url-smoke.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNNER = resolve(ROOT, 'Automation', 'url-smoke.mjs')

test('required URL and output produce the 60-second WebGPU defaults', () => {
  assert.deepEqual(
    parseUrlSmokeArgs([
      '--url',
      'https://example.com/demo',
      '--out',
      'Docs/qa/m4-webgpu.json',
    ]),
    {
      url: 'https://example.com/demo',
      gl: undefined,
      walk: 60,
      out: 'Docs/qa/m4-webgpu.json',
      dryRun: false,
      help: false,
    },
  )
})

test('URL is required', () => {
  assert.throws(
    () => parseUrlSmokeArgs(['--out', 'Docs/qa/m4-webgpu.json']),
    /--url is required/,
  )
})

test('output is required', () => {
  assert.throws(
    () => parseUrlSmokeArgs(['--url', 'https://example.com']),
    /--out is required/,
  )
})

test('only the explicit webgl fallback value is accepted', () => {
  assert.throws(
    () =>
      parseUrlSmokeArgs([
        '--url',
        'https://example.com',
        '--gl',
        'webgpu',
        '--out',
        'result.json',
      ]),
    /--gl only accepts webgl/,
  )
})

test('deployment URL must use HTTPS', () => {
  assert.throws(
    () =>
      parseUrlSmokeArgs([
        '--url',
        'http://example.com',
        '--out',
        'result.json',
      ]),
    /--url must be an absolute HTTPS URL/,
  )
})

test('the current deterministic route only accepts a 60-second walk', () => {
  assert.throws(
    () =>
      parseUrlSmokeArgs([
        '--url',
        'https://example.com',
        '--walk',
        '59',
        '--out',
        'result.json',
      ]),
    /--walk must be 60/,
  )
})

test('smoke URL preserves deployment query and adds low bench switches', () => {
  assert.equal(
    makeSmokeUrl({
      url: 'https://example.com/app?release=1',
      gl: 'webgl',
      walk: 60,
      out: 'Docs/qa/m4-webgl2.json',
      dryRun: false,
      help: false,
    }),
    'https://example.com/app?release=1&q=low&route=bench&gl=webgl',
  )
})

test('--dry-run prints a launch-free plan without contacting the URL', () => {
  const result = spawnSync(
    process.execPath,
    [
      RUNNER,
      '--url',
      'https://deployment.invalid/',
      '--gl',
      'webgl',
      '--walk',
      '60',
      '--out',
      'Docs/qa/m4-webgl2.json',
      '--dry-run',
    ],
    { cwd: ROOT, encoding: 'utf8', timeout: 10_000 },
  )

  assert.equal(result.status, 0, result.stderr)
  const plan = JSON.parse(result.stdout)
  assert.deepEqual(plan, {
    dryRun: true,
    targetUrl: 'https://deployment.invalid/?q=low&route=bench&gl=webgl',
    options: { backend: 'WebGL2', forceWebGL: true, walkSeconds: 60 },
    output: 'Docs/qa/m4-webgl2.json',
    headPreflight: 'skipped',
    browserLaunch: false,
  })
})

test('unknown options and missing values are rejected', () => {
  assert.throws(
    () =>
      parseUrlSmokeArgs([
        '--url',
        'https://example.com',
        '--out',
        'result.json',
        '--mystery',
      ]),
    /unknown option: --mystery/,
  )
  assert.throws(() => parseUrlSmokeArgs(['--url']), /--url requires a value/)
})

test('--help is accepted without required execution options', () => {
  assert.equal(parseUrlSmokeArgs(['--help']).help, true)
})
