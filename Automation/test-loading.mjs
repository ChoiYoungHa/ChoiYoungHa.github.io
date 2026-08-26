import { after, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const QA_PATH = join(ROOT, 'Docs', 'qa', 'm4-loading.json')
const manifest = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'loading-manifest.json'), 'utf8'))
const loadingModule = await import(pathToFileURL(join(ROOT, 'src', 'systems', 'loading.ts')).href)
const { createLoadingStore, runtimeUrl } = loadingModule

const result = {
  schemaVersion: 1,
  testedHead: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
  manifestMeasuredFromHead: manifest.measuredFromHead,
  phaseOrder: [],
  retry: {},
  failures: {},
  bytes: {},
  manifestFileStats: [],
  browserVerification: 'pending-after-merge',
}

function response(status, bytes = 0) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'OK',
    async arrayBuffer() {
      return new Uint8Array(bytes).buffer
    },
  }
}

function uniquePhases(states) {
  return states.map((state) => state.phase).filter((phase, index, phases) => phase !== phases[index - 1])
}

function silentLogger() {
  return { info() {} }
}

function mockManifest() {
  return {
    schemaVersion: 1,
    measuredFromHead: 'test',
    measurement: 'fetch mock',
    phases: {
      boot: [
        { id: 'boot.index', url: 'dist/index.html', bytes: 2, kind: 'html' },
        { id: 'boot.js', url: 'dist/assets/main-test.js', bytes: 3, kind: 'javascript' },
        { id: 'boot.heightmap', url: 'dist/assets/main-test.js', bytes: 0, kind: 'procedural-in-boot-js' },
        { id: 'boot.sky', url: 'dist/env/sky.hdr', bytes: 4, kind: 'hdr' },
      ],
      core: [
        { id: 'core.terrain', url: 'dist/assets/main-test.js', bytes: 0, kind: 'procedural-in-boot-js' },
        { id: 'core.vegetation', url: 'dist/models/vegetation.glb', bytes: 3, kind: 'glb' },
        { id: 'core.hero-lod1', url: 'dist/assets/main-test.js', bytes: 0, kind: 'procedural-in-boot-js' },
      ],
      detail: [
        { id: 'detail.village', url: 'dist/assets/main-test.js', bytes: 0, kind: 'procedural-in-boot-js' },
        { id: 'detail.hero-lod0', url: 'dist/assets/main-test.js', bytes: 0, kind: 'procedural-in-boot-js' },
        { id: 'detail.background', url: 'dist/env/background.hdr', bytes: 5, kind: 'hdr-2k-tier' },
      ],
    },
    summary: {},
  }
}

describe('M4-10B~D manifest phase store', () => {
  test('boot → core → detail → ready, procedural 0B 즉시 완료', async () => {
    const fetched = []
    const logs = []
    const sizes = new Map([
      ['/env/sky.hdr', 4],
      ['/models/vegetation.glb', 3],
      ['/env/background.hdr', 5],
    ])
    const states = []
    const store = createLoadingStore(mockManifest(), {
      fetch: async (url, init) => {
        assert.equal(init?.method, 'GET')
        fetched.push(String(url))
        return response(200, sizes.get(String(url)))
      },
      logger: { info: (message) => logs.push(message) },
    })
    store.subscribe(() => states.push(store.getState()))

    const finalState = await store.start()

    assert.deepEqual(uniquePhases(states), ['boot', 'core', 'detail', 'ready'])
    assert.deepEqual(logs, [
      '[loading] phase boot',
      '[loading] boot -> core',
      '[loading] core -> detail',
      '[loading] detail -> ready',
    ])
    assert.deepEqual(fetched, ['/env/sky.hdr', '/models/vegetation.glb', '/env/background.hdr'])
    assert.deepEqual(finalState, { phase: 'ready', loadedBytes: 0, phaseBytes: 0 })
    result.phaseOrder = uniquePhases(states)
    result.phaseLogs = logs
    result.bytes.mockPhaseBytes = { boot: 9, core: 3, detail: 5 }
  })

  test('dist 경로를 배포 루트 URL로 정규화', () => {
    assert.equal(runtimeUrl('dist/models/vegetation.glb'), '/models/vegetation.glb')
    assert.equal(runtimeUrl('public/env/sky_1k.hdr'), '/env/sky_1k.hdr')
    assert.equal(runtimeUrl('/already-rooted.bin'), '/already-rooted.bin')
  })
})

describe('M4-10E 오류와 재시도', () => {
  test('offline TypeError를 상태에 보존', async () => {
    const store = createLoadingStore(mockManifest(), {
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
      logger: silentLogger(),
    })
    const state = await store.start()
    assert.equal(state.phase, 'boot')
    assert.ok(state.error instanceof TypeError)
    result.failures.offline = { passed: true, errorName: state.error.name, message: state.error.message }
  })

  test('HTTP 404를 오류 상태로 변환', async () => {
    const store = createLoadingStore(mockManifest(), {
      fetch: async () => response(404),
      logger: silentLogger(),
    })
    const state = await store.start()
    assert.match(state.error?.message ?? '', /HTTP 404/)
    result.failures.notFound = { passed: true, status: 404, message: state.error.message }
  })

  test('첫 실패 뒤 retry 1회로 ready', async () => {
    let requestCount = 0
    const sizes = [4, 4, 3, 5]
    const store = createLoadingStore(mockManifest(), {
      fetch: async () => {
        requestCount += 1
        if (requestCount === 1) return response(404)
        return response(200, sizes[requestCount - 1])
      },
      logger: silentLogger(),
    })

    assert.equal((await store.start()).phase, 'boot')
    const recovered = await store.retry()
    assert.equal(recovered.phase, 'ready')
    assert.equal(recovered.error, undefined)
    assert.equal(requestCount, 4)
    result.retry = { passed: true, retryCount: 1, totalFetchCount: requestCount, finalPhase: recovered.phase }
  })
})

test('실제 manifest 선언 bytes를 fetch mock으로 집계', async () => {
  const states = []
  const store = createLoadingStore(manifest, {
    fetch: async (url) => {
      const item = Object.values(manifest.phases).flat().find((entry) => runtimeUrl(entry.url) === String(url) && entry.bytes > 0)
      return response(200, item?.bytes ?? 0)
    },
    logger: silentLogger(),
  })
  store.subscribe(() => states.push(store.getState()))
  assert.equal((await store.start()).phase, 'ready')

  const observed = {}
  for (const phase of ['boot', 'core', 'detail']) {
    observed[phase] = Math.max(0, ...states.filter((state) => state.phase === phase).map((state) => state.loadedBytes))
  }
  assert.deepEqual(observed, manifest.summary.phaseBytes)
  result.bytes.manifestDeclared = manifest.summary.phaseBytes
  result.bytes.mockObserved = observed
})

after(() => {
  const currentBuildPhaseBytes = { boot: 0, core: 0, detail: 0 }
  const currentBuildPhaseComplete = { boot: true, core: true, detail: true }
  for (const phase of ['boot', 'core', 'detail']) {
    for (const item of manifest.phases[phase]) {
      const direct = join(ROOT, ...item.url.split('/'))
      const publicFallback = item.url.startsWith('dist/') ? join(ROOT, 'public', ...item.url.slice(5).split('/')) : null
      let physicalPath = existsSync(direct) ? direct : publicFallback && existsSync(publicFallback) ? publicFallback : null
      if (!physicalPath && item.url.startsWith('dist/assets/')) {
        const assetDir = join(ROOT, 'dist', 'assets')
        const oldName = basename(item.url)
        const hashed = oldName.match(/^(.+)-[^.]+(\.[^.]+)$/)
        const currentName =
          existsSync(assetDir) && hashed
            ? readdirSync(assetDir).find((name) => name.startsWith(`${hashed[1]}-`) && name.endsWith(hashed[2]))
            : undefined
        if (currentName) physicalPath = join(assetDir, currentName)
      }
      const statBytes = physicalPath ? statSync(physicalPath).size : null
      if (item.bytes > 0) {
        if (statBytes === null) currentBuildPhaseComplete[phase] = false
        else currentBuildPhaseBytes[phase] += statBytes
      }
      result.manifestFileStats.push({
        phase,
        id: item.id,
        manifestUrl: item.url,
        physicalPath: physicalPath ? physicalPath.slice(ROOT.length + 1).replaceAll('\\', '/') : null,
        exists: physicalPath !== null,
        statBytes,
        declaredBytes: item.bytes,
      })
    }
  }
  result.bytes.currentBuildStat = currentBuildPhaseBytes
  result.bytes.currentBuildStatComplete = currentBuildPhaseComplete
  result.bytes.declaredMatchesCurrentBuild = Object.fromEntries(
    Object.keys(currentBuildPhaseBytes).map((phase) => [
      phase,
      currentBuildPhaseComplete[phase] && currentBuildPhaseBytes[phase] === manifest.summary.phaseBytes[phase],
    ]),
  )
  result.notes = [
    'HTML/JavaScript are bootstrap-resident when this store starts, so they count declared bytes without duplicate fetch.',
    'The current <=2K background tier uses the measured 1K HDR fallback because no 2K HDR exists in public/env.',
    'Preview, browser UI, and GPU behavior must be verified by master after merge.',
  ]
  mkdirSync(dirname(QA_PATH), { recursive: true })
  writeFileSync(QA_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
})
