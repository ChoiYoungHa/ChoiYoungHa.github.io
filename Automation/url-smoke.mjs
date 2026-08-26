#!/usr/bin/env node

import { execFile, spawn } from 'node:child_process'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHADER_ERROR = /shader|wgsl|glsl|program\s+(?:compile|link)|compile\s+error/i

async function main(argv) {
  const options = parseUrlSmokeArgs(argv)
  if (options.help) {
    printHelp()
    return
  }

  const targetUrl = makeSmokeUrl(options)
  if (options.dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          dryRun: true,
          targetUrl,
          options: {
            backend: options.gl === 'webgl' ? 'WebGL2' : 'WebGPU',
            forceWebGL: options.gl === 'webgl',
            walkSeconds: options.walk,
          },
          output: options.out,
          headPreflight: 'skipped',
          browserLaunch: false,
        },
        null,
        2,
      )}\n`,
    )
    return
  }

  let browser
  try {
    const preflight = await headPreflight(options.url)
    const chromePath = await findChrome()
    browser = await startBrowser(chromePath)
    const consoleErrors = await collectConsoleErrors(browser.cdp)
    const navigation = await browser.cdp.send('Page.navigate', { url: targetUrl })
    if (navigation.errorText) throw new Error(`navigation failed: ${navigation.errorText}`)
    const report = await waitForBenchReport(browser.cdp, options.walk)
    const hud = await readHud(browser.cdp)
    const result = makeResult({ options, targetUrl, preflight, report, hud, consoleErrors })
    await writeResult(options.out, result)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (result.result !== 'PASS') process.exitCode = 1
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1
  } finally {
    await closeBrowser(browser)
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) await main(process.argv.slice(2))

export function parseUrlSmokeArgs(args) {
  const result = {
    url: undefined,
    gl: undefined,
    walk: 60,
    out: undefined,
    dryRun: false,
    help: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--help' || arg === '-h') result.help = true
    else if (arg === '--url') result.url = requireOptionValue(args, ++index, arg)
    else if (arg === '--gl') result.gl = requireOptionValue(args, ++index, arg)
    else if (arg === '--walk') result.walk = Number(requireOptionValue(args, ++index, arg))
    else if (arg === '--out') result.out = requireOptionValue(args, ++index, arg)
    else if (arg === '--dry-run') result.dryRun = true
    else throw new Error(`unknown option: ${arg}`)
  }

  if (result.help) return result
  if (!result.url) throw new Error('--url is required')
  if (!result.out) throw new Error('--out is required')
  if (result.gl !== undefined && result.gl !== 'webgl') throw new Error('--gl only accepts webgl')
  if (result.walk !== 60) throw new Error('--walk must be 60 for the current deterministic route')

  try {
    const url = new URL(result.url)
    if (url.protocol !== 'https:') throw new Error('protocol')
  } catch {
    throw new Error('--url must be an absolute HTTPS URL')
  }
  return result
}

export function makeSmokeUrl(options) {
  const url = new URL(options.url)
  url.searchParams.set('q', 'low')
  url.searchParams.set('route', 'bench')
  if (options.gl === 'webgl') url.searchParams.set('gl', 'webgl')
  else url.searchParams.delete('gl')
  return url.href
}

function requireOptionValue(args, index, option) {
  const value = args[index]
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

async function headPreflight(url) {
  const startedAt = performance.now()
  const response = await fetch(url, {
    method: 'HEAD',
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  const elapsedMs = Math.round((performance.now() - startedAt) * 100) / 100
  if (response.status !== 200) {
    const error = new Error(`HEAD preflight expected HTTP 200, received ${response.status}: ${url}`)
    error.exitCode = 2
    throw error
  }
  return {
    method: 'HEAD',
    requestedUrl: url,
    finalUrl: response.url,
    status: response.status,
    elapsedMs,
  }
}

async function collectConsoleErrors(cdp) {
  const errors = []
  cdp.onEvent((message) => {
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      const text = (message.params.args ?? [])
        .map((arg) => arg.value ?? arg.description ?? arg.type)
        .join(' ')
      errors.push({ source: 'console', text })
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails
      errors.push({
        source: 'exception',
        text: details?.exception?.description ?? details?.text ?? 'Runtime exception',
      })
    }
    if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
      errors.push({ source: 'log', text: message.params.entry.text })
    }
  })
  await cdp.send('Log.enable')
  return errors
}

async function waitForBenchReport(cdp, walkSeconds) {
  const deadline = Date.now() + (walkSeconds + 60) * 1000
  while (Date.now() < deadline) {
    const response = await cdp.send('Runtime.evaluate', {
      expression: 'window.__bench ?? null',
      returnByValue: true,
    })
    const value = response.result?.value
    if (value?.status === 'FAIL') throw new Error(`remote bench failed: ${value.error ?? 'unknown'}`)
    if (value?.perf && value?.errors) return value
    await sleep(250)
  }
  const error = new Error(`bench report timeout after ${walkSeconds + 60}s`)
  error.exitCode = 2
  throw error
}

async function readHud(cdp) {
  const response = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const root = document.querySelector('[data-testid="runtime-hud"]')
      return {
        backend: document.querySelector('[data-testid="hud-backend"]')?.textContent?.trim() ?? '',
        angle: document.querySelector('[data-testid="hud-angle"]')?.textContent?.trim() ?? '',
        text: root?.textContent ?? ''
      }
    })()`,
    returnByValue: true,
  })
  return response.result?.value ?? { backend: '', angle: '', text: '' }
}

function makeResult({ options, targetUrl, preflight, report, hud, consoleErrors }) {
  const uniqueConsoleErrors = dedupeConsoleErrors(consoleErrors)
  const runtimeIssues = report.errors ?? {}
  const intentional = finiteOrZero(runtimeIssues.intentionalRejectionCount)
  const runtimeErrorCount =
    finiteOrZero(runtimeIssues.errorCount) +
    Math.max(0, finiteOrZero(runtimeIssues.unhandledRejectionCount) - intentional) +
    finiteOrZero(runtimeIssues.webglContextLostCount)
  const shaderSources = [
    ...uniqueConsoleErrors.map((entry) => entry.text),
    ...(runtimeIssues.issues ?? []).map((entry) => String(entry.message ?? '')),
  ]
  const shaderErrorCount = new Set(shaderSources.filter((text) => SHADER_ERROR.test(text))).size
  const forceWebGL = /\(forceWebGL\)/.test(hud.text)
  const expectedBackend = options.gl === 'webgl' ? 'WebGL2' : 'WebGPU'
  const expectedForceWebGL = options.gl === 'webgl'
  const finalPosition = report.finalPosition ?? null
  const checks = {
    http200: preflight.status === 200,
    backend: hud.backend === expectedBackend,
    forceWebGL: forceWebGL === expectedForceWebGL,
    shaderErrorZero: shaderErrorCount === 0,
    consoleErrorZero: uniqueConsoleErrors.length === 0,
    runtimeErrorZero: runtimeErrorCount === 0,
    walkCompleted:
      report.duration === options.walk &&
      typeof report.integratedSeconds === 'number' &&
      report.integratedSeconds >= options.walk - 1 &&
      isFinitePosition(finalPosition),
  }
  const result = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'

  return {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    targetUrl,
    httpPreflight: preflight,
    options: {
      requestedBackend: expectedBackend,
      forceWebGL: expectedForceWebGL,
      walkSeconds: options.walk,
    },
    report: {
      backend: hud.backend || 'unknown',
      forceWebGL,
      angle: hud.angle || 'unknown',
      routeHash: report.routeHash ?? 'unknown',
      duration: report.duration ?? null,
      integratedSeconds: report.integratedSeconds ?? null,
      finalPosition,
      fps: {
        average: report.perf?.avgFps ?? null,
        onePercentLow: report.perf?.onePercentLowFps ?? null,
        oneSecondHitches: report.perf?.oneSecondHitches ?? null,
      },
      shaderErrorCount,
      consoleErrorCount: uniqueConsoleErrors.length,
      runtimeErrorCount,
      consoleErrors: uniqueConsoleErrors,
    },
    checks,
    result,
  }
}

function dedupeConsoleErrors(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    // The bench deliberately emits this one rejection to prove the collector.
    if (entry.text.includes('m0b-intentional-rejection')) return false
    const key = entry.text.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function finiteOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isFinitePosition(value) {
  return (
    value !== null &&
    ['x', 'y', 'z'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
  )
}

async function writeResult(path, result) {
  const outputPath = resolve(ROOT, path)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  process.stdout.write(`wrote ${repoPath(outputPath)}\n`)
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
      // Try the next standard installation location.
    }
  }
  throw new Error('Chrome executable not found')
}

async function startBrowser(chromePath) {
  const profileTag = `web3d-url-smoke-${process.pid}-${Date.now()}`
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
      'about:blank',
    ],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
  )
  child.stderr.on('data', (chunk) => process.stderr.write(`[chrome] ${chunk}`))
  const browser = { child, cdp: undefined, profile, profileTag }
  try {
    browser.cdp = await connectCdp(profile, child)
    return browser
  } catch (error) {
    await closeBrowser(browser)
    throw error
  }
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
      // Chrome has not created the port file yet.
    }
    await sleep(100)
  }
  if (!port) throw new Error('Chrome DevToolsActivePort timeout')

  let target
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    )
    target = targets.find((candidate) => candidate.type === 'page')
    if (target) break
    await sleep(100)
  }
  if (!target) throw new Error('Chrome page target not found')

  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', () => reject(new Error('CDP WebSocket open failed')), {
      once: true,
    })
  })

  let nextId = 0
  const pending = new Map()
  const listeners = new Set()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) waiter.reject(new Error(`CDP ${message.error.message}`))
      else waiter.resolve(message.result)
      return
    }
    for (const listener of listeners) listener(message)
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
    onEvent(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      socket.close()
    },
  }
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  return cdp
}

async function closeBrowser(browser) {
  browser?.cdp?.close()
  if (browser?.child?.pid) {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(browser.child.pid), '/T', '/F'], {
        windowsHide: true,
      }).catch(() => {})
    } else {
      try {
        browser.child.kill('SIGTERM')
      } catch {
        // Already stopped.
      }
    }
  }
  if (browser?.profile) await rm(browser.profile, { recursive: true, force: true }).catch(() => {})
}

function repoPath(path) {
  return relative(ROOT, path).replaceAll('\\', '/')
}

function printHelp() {
  process.stdout.write(
    'usage: node Automation/url-smoke.mjs --url <https://...> [--gl webgl] [--walk 60] --out <json> [--dry-run]\n',
  )
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}
