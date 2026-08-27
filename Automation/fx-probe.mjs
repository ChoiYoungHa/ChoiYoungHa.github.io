// Skill FX browser probe: samples the public R3F mesh after Digit2 and captures the peak frame.
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const args = new Map(process.argv.slice(2).map((value, index, all) => [value, all[index + 1]]))
const label = args.get('--label') ?? 'probe'
const baseUrl = args.get('--url') ?? 'http://localhost:5173'
const forceWebGl = args.get('--gl') === 'webgl'
const domKey = args.has('--dom-key')
const forcePark = args.has('--force-park')
const outputDir = args.get('--out-dir') ?? 'Docs/qa/fx-probe'
const profile = join(tmpdir(), `web3d-fxprobe-${Date.now()}`)
await mkdir(profile, { recursive: true })
await mkdir(outputDir, { recursive: true })

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11',
  '--no-first-run', '--disable-extensions', '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--remote-debugging-port=0',
  `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', windowsHide: true })

let ws
try {
  let port
  for (let attempt = 0; attempt < 200 && port === undefined; attempt += 1) {
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/u)[0]) }
    catch { await sleep(100) }
  }
  if (!port) throw new Error('Chrome DevTools port was not created')
  let target
  for (let attempt = 0; attempt < 100 && target === undefined; attempt += 1) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json())
    target = targets.find((entry) => entry.type === 'page')
    if (target === undefined) await sleep(100)
  }
  if (target === undefined) throw new Error('Chrome page target was not created')

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  let requestId = 0
  const pending = new Map()
  const errors = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method !== undefined) {
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text)
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '))
      return
    }
    const waiter = pending.get(message.id)
    if (waiter === undefined) return
    pending.delete(message.id)
    clearTimeout(waiter.timer)
    if (message.error !== undefined) waiter.reject(new Error(message.error.message))
    else waiter.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++requestId
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, 15_000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, includeCommandLineAPI: true })
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.bringToFront')
  await send('Page.navigate', { url: `${baseUrl}/?game=1&net=0&scene=hunt&q=low${forceWebGl ? '&gl=webgl' : ''}` })
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(250)
    const ready = await evaluate(`(() => { let fx = null; globalThis.__R3F_SCENE__?.traverse((o) => { if (o.name === 'm6-skill-fx') fx = o }); return !!fx })()`)
    if (ready) break
    if (attempt === 79) throw new Error('m6-skill-fx did not mount')
  }
  await evaluate(`(async () => {
    const session = (await import('/src/game/bootstrap.ts')).gameBootstrap?.session
    if (!session || globalThis.__fxProbeLog) return false
    globalThis.__fxProbeLog = []
    let visualPlayerPosition = session.getSnapshot().playerPos
    const getSnapshot = session.getSnapshot.bind(session)
    if (${forcePark ? 'true' : 'false'}) session.getSnapshot = () => ({ ...getSnapshot(), playerPos: visualPlayerPosition })
    const enqueue = session.enqueueInput.bind(session)
    session.enqueueInput = (input) => { globalThis.__fxProbeQueued = true; globalThis.__fxProbeLog.push({ kind: 'enqueue', input }); return enqueue(input) }
    const tick = session.tick.bind(session)
    session.tick = (frame) => {
      const before = session.getSnapshot()
      visualPlayerPosition = frame.playerPos
      const result = tick(${forcePark ? `{ ...frame, playerPos: { x: -80, z: 8 } }` : 'frame'})
      if (${forcePark ? 'true' : 'false'}) result.snapshot = { ...result.snapshot, playerPos: visualPlayerPosition }
      if (globalThis.__fxProbeQueued || result.events.length > 0 || before.game.mp !== result.snapshot.game.mp) globalThis.__fxProbeLog.push({ kind: 'tick', direct: frame.inputs, beforeMp: before.game.mp, afterMp: result.snapshot.game.mp, respawn: result.snapshot.respawnState.phase, activeDialogue: result.snapshot.activeDialogue?.treeId ?? null, events: result.events.map((event) => ({ type: event.type, skillId: event.skillId, reason: event.reason })) })
      globalThis.__fxProbeQueued = false
      return result
    }
    return true
  })()`)

  const sampleExpression = `(async () => {
    const bootstrap = (await import('/src/game/bootstrap.ts')).gameBootstrap
    const snapshot = bootstrap?.session.getSnapshot()
    let fx = null, player = null
    globalThis.__R3F_SCENE__?.traverse((object) => {
      if (object.name === 'm6-skill-fx') fx = object
      if (object.name === 'player' && !object.isMesh) player = object
    })
    if (!fx) return { mounted: false }
    const count = fx.count
    const matrix = new fx.matrixWorld.constructor()
    const positions = []
    for (let index = 0; index < count; index += 1) {
      fx.getMatrixAt(index, matrix)
      positions.push([matrix.elements[12], matrix.elements[13], matrix.elements[14]].map((value) => +value.toFixed(3)))
    }
    const values = (name, stride) => {
      const attribute = fx.geometry.getAttribute(name)
      return attribute ? Array.from(attribute.array.slice(0, count * stride), (value) => +value.toFixed(4)) : null
    }
    const material = Array.isArray(fx.material) ? fx.material[0] : fx.material
    const map = material.map
    const image = map?.image ?? map?.source?.data
    const playerPosition = player ? [player.position.x, player.position.y, player.position.z].map((value) => +value.toFixed(3)) : null
    return {
      mounted: true, count, positions, playerPosition,
      life: values('life', 1), frame: values('frame', 1), uvRect: values('uvRect', 4), center: values('center', 3),
      material: { name: material.name, visible: material.visible, alphaTest: material.alphaTest, depthTest: material.depthTest, depthWrite: material.depthWrite, mapLoaded: !!image, mapWidth: image?.width ?? 0, mapHeight: image?.height ?? 0 },
      session: snapshot ? { nowMs: snapshot.nowMs, scene: snapshot.game.scene, jobId: snapshot.game.jobId, mp: snapshot.game.mp, recentEvents: snapshot.recentEvents.slice(-8).map((event) => ({ type: event.type, sequence: event.sequence, atMs: event.atMs, skillId: event.skillId, reason: event.reason })) } : null,
      keydownListeners: typeof getEventListeners === 'function' ? getEventListeners(window).keydown?.length ?? 0 : -1,
      probeLog: globalThis.__fxProbeLog ?? [],
      hud: (document.querySelector('[aria-label="게임 HUD"]')?.textContent ?? '').replace(/\\s+/gu, ' ').trim(),
    }
  })()`

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 })
  const before = await evaluate(sampleExpression)
  if (domKey) {
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true }))`)
    await sleep(50)
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2', key: '2', bubbles: true }))`)
  } else {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50 })
    await sleep(50)
    await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Digit2', key: '2', windowsVirtualKeyCode: 50, nativeVirtualKeyCode: 50 })
  }

  const samples = []
  let peak = null
  for (let elapsedMs = 0; elapsedMs <= 800; elapsedMs += 40) {
    await sleep(40)
    const sample = { elapsedMs: elapsedMs + 40, ...await evaluate(sampleExpression) }
    samples.push(sample)
    if (peak === null || sample.count > peak.count) {
      peak = sample
      if (sample.count > 0) {
        const screenshot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(join(outputDir, `${label}.png`), Buffer.from(screenshot.data, 'base64'))
      }
    }
  }
  const result = { label, url: baseUrl, forceWebGl, domKey, forcePark, before, peak, samples, errors }
  await writeFile(join(outputDir, `${label}.json`), JSON.stringify(result, null, 2))
  process.stdout.write(`${JSON.stringify({ label, beforeCount: before.count, peakCount: peak?.count, peak, errors })}\n`)
} finally {
  ws?.close()
  if (chrome.exitCode === null) chrome.kill()
  await Promise.race([
    new Promise((resolve) => chrome.once('exit', resolve)),
    sleep(1_000),
  ])
  if (chrome.exitCode === null) {
    const killer = spawn('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    await Promise.race([new Promise((resolve) => killer.once('exit', resolve)), sleep(2_000)])
  }
  chrome.unref()
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}
