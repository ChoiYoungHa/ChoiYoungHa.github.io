#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_PORT = 4173
const UNKNOWN = '확인 불가'
const CSV_COLUMNS = [
  'run',
  'date',
  'build_hash',
  'backend',
  'angle',
  'preset',
  'routeHash',
  'avg_fps',
  'low1_fps',
  'hitch_1s',
  'calls',
  'programs',
  'textureGpuMB',
  'jsHeapPeakMB',
  'processRAMGB',
  'crash',
  'errors',
]

let options
let receiver
let preview
let browser
let previewStarted = false
let cleanupStarted = false

async function main(argv) {
  options = parseBenchArgs(argv)
  if (options.help) {
    printHelp()
    return
  }

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      void cleanup().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143))
    })
  }

  try {
    if (options.buildMode === 'skip') await assertExistingDist(resolve(ROOT, 'dist'))
    await assertPortFree(PREVIEW_PORT)
    if (options.buildMode === 'once') {
      await runForeground(npmCommand(), npmArgs(['run', 'build']))
    }
    const buildHash = (await capture('git', ['rev-parse', '--short', 'HEAD'])).trim()

    receiver = createResultReceiver()
    await receiver.listen()
    preview = startPreview()
    await waitForPreview(preview)
    previewStarted = true

    const chromePath = await findChrome()
    const warmupUrl = makeUrl({ gl: options.gl })
    browser = await startBrowser(chromePath, warmupUrl)
    process.stdout.write(`warmup ${options.warmup}s\n`)
    await sleep(options.warmup * 1000)

    if (options.soak !== undefined) {
      const result = await runSoak(buildHash)
      await writeSoakReport(result)
      if (!result.pass) process.exitCode = 1
    } else {
      const rows = []
      for (let index = 1; index <= options.runs; index += 1) {
        process.stdout.write(`bench run ${index}/${options.runs}\n`)
        const result = await runBenchNavigation(index, buildHash)
        rows.push(result.row)
      }
      const output = options.output ?? defaultCsvPath(options.gl)
      await writeCsv(output, rows)
      const pass = validateRows(rows, options.gl)
      process.stdout.write(`CSV ${output}\n`)
      if (!pass) process.exitCode = 1
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1
  } finally {
    await cleanup()
    if (await isPortOpen(PREVIEW_PORT)) {
      process.stderr.write(`cleanup failed: port ${PREVIEW_PORT} is still listening\n`)
      process.exitCode = 1
    } else {
      process.stdout.write(`cleanup PASS: port ${PREVIEW_PORT} listener 0\n`)
    }
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) await main(process.argv.slice(2))

async function runSoak(buildHash) {
  const startedAt = Date.now()
  const rows = []
  let crash = 0
  let tdr = 0
  let contextLost = 0
  let index = 0

  while ((Date.now() - startedAt) / 1000 < options.soak) {
    index += 1
    process.stdout.write(`soak cycle ${index}\n`)
    const result = await runBenchNavigation(index, buildHash)
    rows.push(result.row)
    crash += result.diagnostics.crash
    tdr += result.diagnostics.tdr
    contextLost += result.diagnostics.contextLost
    if (result.diagnostics.crash > 0) break
  }

  const elapsed = Math.round(((Date.now() - startedAt) / 1000) * 100) / 100
  return {
    requested: options.soak,
    elapsed,
    cycles: rows.length,
    buildHash,
    backend: commonValue(rows, 'backend'),
    preset: options?.preset ?? 'low',
    crash,
    tdr,
    contextLost,
    errors: rows.reduce((sum, row) => sum + numberOrZero(row.errors), 0),
    pass: elapsed >= options.soak && crash === 0 && tdr === 0,
  }
}

async function runBenchNavigation(index, buildHash) {
  const name = `m0b-${options.gl ?? 'webgpu'}-${Date.now()}-${index}`
  const reportPromise = receiver.waitFor(name, 90_000)
  const url = makeUrl({ gl: options.gl, reportName: name, reportOrigin: receiver.origin })

  try {
    await browser.cdp.send('Page.navigate', { url })
    const report = await Promise.race([
      reportPromise,
      browser.exited.then(({ code, signal }) => {
        throw new Error(`Chrome exited before result: code=${code} signal=${signal}`)
      }),
    ])
    const hud = await readHud(browser.cdp)
    return resultToRow(index, buildHash, report, hud)
  } catch (error) {
    process.stderr.write(`run ${index} FAIL: ${error instanceof Error ? error.message : String(error)}\n`)
    return {
      row: {
        run: index,
        date: new Date().toISOString(),
        build_hash: buildHash,
        backend: UNKNOWN,
        angle: UNKNOWN,
        preset: options?.preset ?? 'low',
        routeHash: UNKNOWN,
        avg_fps: UNKNOWN,
        low1_fps: UNKNOWN,
        hitch_1s: UNKNOWN,
        calls: UNKNOWN,
        programs: UNKNOWN,
        textureGpuMB: UNKNOWN,
        jsHeapPeakMB: UNKNOWN,
        processRAMGB: UNKNOWN,
        crash: 1,
        errors: 1,
      },
      diagnostics: { crash: 1, tdr: 0, contextLost: 0 },
    }
  }
}

function resultToRow(index, buildHash, report, hud) {
  const perf = report?.perf ?? {}
  const issues = report?.errors ?? {}
  const intentional = numberOrZero(issues.intentionalRejectionCount)
  const contextLost = numberOrZero(issues.webglContextLostCount)
  const tdr = numberOrZero(issues.tdrCount)
  const errors =
    numberOrZero(issues.errorCount) +
    Math.max(0, numberOrZero(issues.unhandledRejectionCount) - intentional) +
    contextLost
  const crash = report?.status === 'FAIL' ? 1 : 0

  return {
    row: {
      run: index,
      date: new Date().toISOString(),
      build_hash: buildHash,
      backend: hud.backend || UNKNOWN,
      angle: hud.angle || UNKNOWN,
      preset: options?.preset ?? 'low',
      routeHash: report?.routeHash ?? UNKNOWN,
      avg_fps: measured(perf.avgFps),
      low1_fps: measured(perf.onePercentLowFps),
      hitch_1s: measured(perf.oneSecondHitches),
      calls: measured(perf.maxCalls),
      programs: measured(perf.maxPrograms),
      textureGpuMB: measured(perf.textureGpuMB),
      jsHeapPeakMB: measured(perf.jsHeapPeakMB),
      processRAMGB: UNKNOWN,
      crash,
      errors,
    },
    diagnostics: { crash, tdr, contextLost },
  }
}

async function readHud(cdp) {
  const expression = `(() => ({
    backend: document.querySelector('[data-testid="hud-backend"]')?.textContent?.trim() ?? '',
    angle: document.querySelector('[data-testid="hud-angle"]')?.textContent?.trim() ?? ''
  }))()`
  const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true })
  return response.result?.value ?? { backend: '', angle: '' }
}

function validateRows(rows, gl) {
  const routeHashes = new Set(rows.map((row) => row.routeHash))
  let pass =
    rows.length === options.runs &&
    routeHashes.size === 1 &&
    !routeHashes.has(UNKNOWN) &&
    rows.every((row) => row.crash === 0 && row.errors === 0)

  if (gl === 'webgl') {
    pass =
      pass &&
      rows.every(
        (row) => row.backend === 'WebGL2' && row.angle !== UNKNOWN && row.angle !== '' && row.angle !== 'n/a',
      )
  }
  process.stdout.write(`measurement ${pass ? 'PASS' : 'FAIL'}\n`)
  return pass
}

async function writeCsv(path, rows) {
  const outputPath = resolve(ROOT, path)
  const medianRow = Object.fromEntries(CSV_COLUMNS.map((column) => [column, medianColumn(rows, column)]))
  medianRow.run = 'median'
  medianRow.date = new Date().toISOString()
  medianRow.processRAMGB = UNKNOWN
  const lines = [CSV_COLUMNS.join(','), ...[...rows, medianRow].map(toCsvLine)]
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8')
}

async function writeSoakReport(result) {
  const outputPath = resolve(ROOT, options.soakOutput ?? join('Docs', 'qa', 'm0b-15min.md'))
  const text = `# M0b-25 15분 안정성\n\n` +
    `- date: ${new Date().toISOString()}\n` +
    `- build_hash: ${result.buildHash}\n` +
    `- backend: ${result.backend}\n` +
    `- preset: ${result.preset}\n` +
    `- requested: ${result.requested}s\n` +
    `- elapsed: ${result.elapsed}s\n` +
    `- cycles: ${result.cycles}\n` +
    `- crash: ${result.crash}\n` +
    `- TDR: ${result.tdr}\n` +
    `- context-lost: ${result.contextLost}\n` +
    `- errors: ${result.errors}\n` +
    `- result: ${result.pass ? 'PASS' : 'FAIL'}\n`
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, text, 'utf8')
  process.stdout.write(`SOAK ${outputPath}\n`)
}

function medianColumn(rows, column) {
  const values = rows.map((row) => row[column])
  if (values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  }
  return values.every((value) => value === values[0]) ? values[0] : '불일치'
}

function toCsvLine(row) {
  return CSV_COLUMNS.map((column) => csvCell(row[column])).join(',')
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function commonValue(rows, key) {
  const values = [...new Set(rows.map((row) => row[key]))]
  return values.length === 1 ? values[0] : '불일치'
}

function createResultReceiver() {
  const pending = new Map()
  const buffered = new Map()
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*' })
      res.end()
      return
    }
    if (req.method !== 'POST' || url.pathname !== '/result') {
      res.writeHead(404)
      res.end('not found')
      return
    }

    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const name = url.searchParams.get('name') ?? ''
      const waiter = pending.get(name)
      if (waiter) {
        pending.delete(name)
        clearTimeout(waiter.timeout)
        waiter.resolve(result)
      } else {
        buffered.set(name, result)
      }
      res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' })
      res.end('ok')
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain' })
      res.end(error instanceof Error ? error.message : String(error))
    }
  })

  return {
    origin: '',
    async listen() {
      await new Promise((resolveListen, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolveListen)
      })
      const address = server.address()
      this.origin = `http://127.0.0.1:${address.port}`
    },
    waitFor(name, timeoutMs) {
      if (buffered.has(name)) {
        const value = buffered.get(name)
        buffered.delete(name)
        return Promise.resolve(value)
      }
      return new Promise((resolveResult, reject) => {
        const timeout = setTimeout(() => {
          pending.delete(name)
          reject(new Error(`result timeout after ${timeoutMs}ms: ${name}`))
        }, timeoutMs)
        pending.set(name, { resolve: resolveResult, reject, timeout })
      })
    },
    async close() {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timeout)
        waiter.reject(new Error('result receiver closed'))
      }
      pending.clear()
      if (!server.listening) return
      await new Promise((resolveClose) => server.close(resolveClose))
    },
  }
}

async function startBrowser(chromePath, url) {
  const profileTag = `web3d-bench-${process.pid}-${Date.now()}`
  const profile = join(tmpdir(), profileTag)
  await mkdir(profile, { recursive: true })
  const child = spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--enable-unsafe-webgpu',
      '--use-angle=d3d11',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--remote-debugging-port=0',
      '--remote-allow-origins=*',
      `--user-data-dir=${profile}`,
      '--window-size=1280,720',
      url,
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  )
  child.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
  const exited = new Promise((resolveExit) =>
    child.once('exit', (code, signal) => resolveExit({ code, signal })),
  )
  const cdp = await connectCdp(profile, child)
  return { child, cdp, exited, profile, profileTag }
}

async function connectCdp(profile, child) {
  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + 20_000
  let port
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Chrome exited during CDP startup: ${child.exitCode}`)
    try {
      const [value] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/)
      port = Number(value)
      if (Number.isInteger(port)) break
    } catch {
      // Chrome has not created DevToolsActivePort yet.
    }
    await sleep(100)
  }
  if (!port) throw new Error('Chrome DevToolsActivePort timeout')

  let target
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
    target = targets.find((candidate) => candidate.type === 'page')
    if (target) break
    await sleep(100)
  }
  if (!target) throw new Error('Chrome page target not found')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket open failed')), { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (!message.id || !pending.has(message.id)) return
    const waiter = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) waiter.reject(new Error(`CDP ${message.error.message}`))
    else waiter.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('CDP WebSocket closed'))
    pending.clear()
  })

  const cdp = {
    send(method, params = {}) {
      return new Promise((resolveResult, reject) => {
        const id = ++nextId
        pending.set(id, { resolve: resolveResult, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    close() {
      socket.close()
    },
  }
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  return cdp
}

function startPreview() {
  const child = spawn(
    npmCommand(),
    npmArgs(['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort']),
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  )
  child.log = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      child.log = `${child.log}${chunk}`.slice(-8000)
    })
  }
  return child
}

async function waitForPreview(child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`preview exited ${child.exitCode}\n${child.log}`)
    try {
      const response = await fetch(`http://127.0.0.1:${PREVIEW_PORT}/`)
      if (response.ok) return
    } catch {
      // Preview is still starting.
    }
    await sleep(250)
  }
  throw new Error(`preview readiness timeout\n${child.log}`)
}

function makeUrl({ gl, reportName, reportOrigin, preset = options?.preset ?? 'low' }) {
  // R114-A: `--preset base` 로 base 프리셋 관문 실측. 기본값 low 는 불변.
  const params = new URLSearchParams({ q: preset })
  if (gl === 'webgl') params.set('gl', 'webgl')
  if (reportName) {
    params.set('route', 'bench')
    params.set('benchReport', reportName)
    params.set('benchReportOrigin', reportOrigin)
  }
  return `http://127.0.0.1:${PREVIEW_PORT}/?${params}`
}

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  browser?.cdp?.close()
  if (browser?.child?.pid) await killTree(browser.child.pid)
  if (browser?.profileTag) await killChromeProfile(browser.profileTag)
  if (browser?.profile) await rm(browser.profile, { recursive: true, force: true }).catch(() => {})
  if (preview?.pid) await killTree(preview.pid)
  if (previewStarted) await stopPortListeners(PREVIEW_PORT)
  await receiver?.close?.()
}

async function killTree(pid) {
  if (!pid) return
  if (process.platform === 'win32') {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).catch(() => {})
  } else {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // Already stopped.
    }
  }
}

async function killChromeProfile(profileTag) {
  if (process.platform !== 'win32') return
  const command =
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ` +
    `Where-Object { $_.CommandLine -like '*${profileTag}*' } | ` +
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => {})
}

async function stopPortListeners(port) {
  if (process.platform !== 'win32') return
  const command =
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ` +
    `ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => {})
}

async function assertPortFree(port) {
  if (await isPortOpen(port)) throw new Error(`port ${port} is already in use; refusing to stop an unknown process`)
}

function isPortOpen(port) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolveOpen(true)
    })
    socket.once('error', () => resolveOpen(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolveOpen(false)
    })
  })
}

async function findChrome() {
  const candidates = [
    join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next standard user/system installation path.
    }
  }
  throw new Error('Chrome executable not found')
}

function runForeground(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} exited code=${code} signal=${signal}`))
    })
  })
}

async function capture(command, args) {
  const { stdout } = await execFileAsync(command, args, { cwd: ROOT, windowsHide: true })
  return stdout
}

function npmCommand() {
  return process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm'
}

function npmArgs(args) {
  return process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args
}

function measured(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : UNKNOWN
}

function numberOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function defaultCsvPath(gl) {
  return gl === 'webgl' ? 'Docs/perf/m0b-webgl-runs.csv' : 'Docs/perf/m0b-runs.csv'
}

export function parseBenchArgs(args) {
  let buildOnceExplicit = false
  let skipBuildExplicit = false
  const result = {
    runs: 3,
    warmup: 30,
    gl: undefined,
    soak: undefined,
    output: undefined,
    soakOutput: undefined,
    preset: 'low',
    help: false,
    buildMode: 'once',
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (arg === '--build-once') {
      if (skipBuildExplicit) throw new Error('--skip-build and --build-once are mutually exclusive')
      buildOnceExplicit = true
      result.buildMode = 'once'
    } else if (arg === '--skip-build') {
      if (buildOnceExplicit) throw new Error('--skip-build and --build-once are mutually exclusive')
      skipBuildExplicit = true
      result.buildMode = 'skip'
    } else if (arg === '--runs') result.runs = Number(requireOptionValue(args, ++index, arg))
    else if (arg === '--warmup') result.warmup = Number(requireOptionValue(args, ++index, arg))
    else if (arg === '--gl') result.gl = requireOptionValue(args, ++index, arg)
    else if (arg === '--soak') result.soak = Number(requireOptionValue(args, ++index, arg))
    else if (arg === '--output') result.output = requireOptionValue(args, ++index, arg)
    else if (arg === '--soak-output') result.soakOutput = requireOptionValue(args, ++index, arg)
    else if (arg === '--preset') result.preset = requireOptionValue(args, ++index, arg)
    else throw new Error(`unknown option: ${arg}`)
  }
  validateOptions(result)
  return result
}

function requireOptionValue(args, index, option) {
  const value = args[index]
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

export async function assertExistingDist(distPath) {
  try {
    const details = await stat(distPath)
    if (details.isDirectory()) return
  } catch {
    // The common missing/inaccessible path is reported uniformly below.
  }
  const error = new Error(`--skip-build requires an existing dist directory: ${distPath}`)
  error.exitCode = 2
  throw error
}

function validateOptions(value) {
  if (!Number.isInteger(value.runs) || value.runs < 1) throw new Error('--runs must be a positive integer')
  if (!Number.isFinite(value.warmup) || value.warmup < 0) throw new Error('--warmup must be >= 0')
  if (value.gl !== undefined && value.gl !== 'webgl') throw new Error('--gl only accepts webgl')
  if (value.preset !== 'low' && value.preset !== 'base') throw new Error('--preset must be low or base')
  if (value.soak !== undefined && (!Number.isFinite(value.soak) || value.soak <= 0)) {
    throw new Error('--soak must be > 0 seconds')
  }
}

function printHelp() {
  process.stdout.write(
    'usage: node Automation/run-bench.mjs [--build-once|--skip-build] [--runs 3] [--warmup 30] [--gl webgl] [--preset low|base] [--soak 900] [--output path] [--soak-output path]\n' +
      '  --build-once  build dist once before this invocation (default)\n' +
      '  --skip-build  reuse an existing dist directory; mutually exclusive with --build-once\n',
  )
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
