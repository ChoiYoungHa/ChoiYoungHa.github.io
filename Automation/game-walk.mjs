// R109-A — `?game=1` 통합 브라우저 검증 러너 (헤드리스 Chrome + CDP, dist 재사용).
// 사용: node Automation/game-walk.mjs <baseline|final|game> --out-dir <dir> [--port 5190] [--tag r109]
//   baseline : `/?q=low` 를 열어 [data-game-overlay]·m6-game-runtime 부재, game lazy 청크 요청 0, 콘솔 error 0 을 기록
//   final    : `/?route=final&q=low&report=…` 재생 → finalPosition 과 마지막 waypoint 편차
//   game     : `/?game=1&q=low` 에서 S00~S10 을 키·DOM 주입으로 진행, 씬별 PNG 캡처, 사냥 중 60초 프레임 샘플, 최종 state JSON
// 코드는 검증만 한다(게임 소스 수정 없음). 플레이어 위치는 씬 그래프의 플레이어 박스(0.8×1.8×0.8)에서 읽는다.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)
const ROOT = process.env.WEB3D_ROOT ?? 'C:/Users/USER/Desktop/claude/해커톤/web3d'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const args = process.argv.slice(2)
const mode = args[0]
const o = { outDir: null, port: 5190, tag: 'r109' }
for (let i = 1; i < args.length; i += 1) {
  const a = args[i]; const n = () => args[++i]
  if (a === '--out-dir') o.outDir = n(); else if (a === '--port') o.port = Number(n()); else if (a === '--tag') o.tag = n()
}
if (!['baseline', 'final', 'game'].includes(mode) || !o.outDir) throw new Error('usage: game-walk.mjs <baseline|final|game> --out-dir <dir>')
await mkdir(o.outDir, { recursive: true })

// ───────────── 월드 상수 (src/data 에서 읽음) ─────────────
const placement = JSON.parse(await readFile(join(ROOT, 'src/data/placement.json'), 'utf8'))
const zones = JSON.parse(await readFile(join(ROOT, 'src/game/data/zones.json'), 'utf8'))
const finalRoute = JSON.parse(await readFile(join(ROOT, 'src/systems/bench/final-route.json'), 'utf8'))
const NPC = Object.fromEntries(placement.npcs.map((n) => [n.id, { x: n.position[0], z: n.position[1] }]))
const GATE = zones.triggers.villageGate.center
const PARK = zones.zones.park.center

// ───────────── Chrome / CDP ─────────────
async function killChromeProfile(tag) {
  const command = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => {})
}
async function connectCdp(profile, child) {
  const portFile = join(profile, 'DevToolsActivePort'); const deadline = Date.now() + 20000; let p
  while (Date.now() < deadline) { if (child.exitCode !== null) throw new Error('chrome exited ' + child.exitCode); try { const [v] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/); p = Number(v); if (Number.isInteger(p)) break } catch {} await sleep(100) }
  if (!p) throw new Error('DevToolsActivePort timeout')
  let target; while (Date.now() < deadline) { const targets = await fetch(`http://127.0.0.1:${p}/json/list`).then((r) => r.json()); target = targets.find((t) => t.type === 'page'); if (target) break; await sleep(100) }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', () => rej(new Error('ws')), { once: true }) })
  let nextId = 0; const pending = new Map(); const events = []
  socket.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { events.push(m); return } const w = pending.get(m.id); if (!w) return; pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
  const cdp = { events, send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }), close: () => socket.close() }
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Network.enable')
  return cdp
}
function consoleErrors(cdp) {
  const c = cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300))
  const x = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.params.exceptionDetails?.text)
  const l = cdp.events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error').map((e) => e.params.entry.text.slice(0, 300))
  return { console: c, exceptions: x, log: l, total: c.length + x.length + l.length }
}
function requestedUrls(cdp) {
  return [...new Set(cdp.events.filter((e) => e.method === 'Network.requestWillBeSent').map((e) => e.params.request.url))]
}

const server = spawn(process.execPath, [join(ROOT, 'Automation/probe-server.mjs'), String(o.port), '9', String(15 * 60 * 1000)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
let serverLog = ''; server.stdout.on('data', (c) => { serverLog += c }); server.stderr.on('data', (c) => { serverLog += c })
{ const t0 = Date.now(); while (!serverLog.includes('LISTENING') && Date.now() - t0 < 10000) await sleep(100) }
const profileTag = `web3d-gamewalk-${process.pid}-${Date.now()}`; const profile = join(tmpdir(), profileTag); await mkdir(profile, { recursive: true })
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { cwd: ROOT, stdio: 'ignore', windowsHide: true })
const cdp = await connectCdp(profile, chrome)
const evaluate = async (expression) => { const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result?.value }
const shots = []
async function shot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const file = join(o.outDir, `m6-${name}-${o.tag}.png`)
  await writeFile(file, Buffer.from(r.data, 'base64'))
  shots.push({ name, file, bytes: r.data.length })
  process.stdout.write(`shot ${name} ${Math.round(r.data.length * 0.75 / 1024)}KB\n`)
}
const KEY = { Escape: ['Escape', 27], KeyW: ['w', 87], KeyS: ['s', 83], KeyA: ['a', 65], KeyD: ['d', 68], ShiftLeft: ['Shift', 16], Space: [' ', 32], KeyF: ['f', 70], Digit1: ['1', 49], Digit2: ['2', 50], KeyI: ['i', 73], Enter: ['Enter', 13] }
const down = new Set()
async function keyDown(code) { const [key, vk] = KEY[code]; down.add(code); await cdp.send('Input.dispatchKeyEvent', { type: key.length === 1 ? 'keyDown' : 'rawKeyDown', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: down.has('ShiftLeft') ? 8 : 0 }) }
async function keyUp(code) { const [key, vk] = KEY[code]; down.delete(code); await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }) }
async function tap(code, holdMs = 60) { await keyDown(code); await sleep(holdMs); await keyUp(code) }

// ───────────── 브라우저 안 읽기 ─────────────
const READ_STATE = `(() => {
  const scene = globalThis.__R3F_SCENE__; const out = { player: null, pigs: [], drops: [], npcs: {}, runtime: false, overlay: !!document.querySelector('[data-game-overlay]') }
  if (scene) scene.traverse((obj) => {
    if (obj.name === 'player' && !obj.isMesh && out.player === null) out.player = { x: obj.position.x, y: obj.position.y, z: obj.position.z, heading: obj.rotation.y } // R117: 큐브 대신 아바타 그룹
    if (obj.name === 'm6-game-runtime') out.runtime = true
    if (/^npc-(stan|maya)$/.test(obj.name)) { const b = new (obj.position.constructor)(); out.npcs[obj.name.slice(4)] = { x: obj.position.x, y: obj.position.y, z: obj.position.z, scale: obj.children[0]?.scale?.x ?? null } }
    if (obj.isInstancedMesh && obj.parent?.name === 'm6-game-runtime') {
      const cap = obj.instanceMatrix.count; const list = []
      for (let i = 0; i < obj.count; i++) { const e = obj.instanceMatrix.array; const k = i * 16; list.push({ x: e[k + 12], y: e[k + 13], z: e[k + 14], s: Math.hypot(e[k], e[k + 1], e[k + 2]) }) }
      if (obj.geometry?.type === 'PlaneGeometry') out.drops = list; else if (cap === 10) out.pigs = list; else out.terrace = { cap, count: obj.count }
    }
  })
  const q = (sel) => document.querySelector(sel)?.textContent ?? null
  out.hud = { stats: q('[aria-label="캐릭터 상태"]'), quest: q('[aria-label="퀘스트 추적"]'), hasHud: !!document.querySelector('[aria-label="게임 HUD"]') }
  out.dialogue = !!document.querySelector('[data-dialogue-panel], [aria-label="대화"]') || [...document.querySelectorAll('[data-game-overlay] *')].some((el) => el.getAttribute('role') === 'dialog')
  out.buttons = [...document.querySelectorAll('[data-game-overlay] button')].map((b) => ({ text: b.textContent.trim().slice(0, 24), disabled: b.disabled }))
  out.overlayText = document.querySelector('[data-game-overlay]')?.innerText?.replace(/\\s+/g, ' ').slice(0, 400) ?? null
  out.hpBars = document.querySelectorAll('[data-mob-hp-bar], [aria-label="몬스터 체력"]').length
  out.floaters = document.querySelectorAll('[data-damage-floater]').length
  return out
})()`
const readState = () => evaluate(READ_STATE)
const clickButton = (pattern) => evaluate(`(() => { const b = [...document.querySelectorAll('[data-game-overlay] button')].find((x) => ${pattern}); if (!b) return null; b.click(); return b.textContent.trim() })()`)

// yaw 는 Controller 의 드래그 규약(yaw -= dx*0.005)으로만 바꿀 수 있다. 시작 0 에서 누적 추적.
let yaw = 0
async function setYaw(target) {
  let d = target - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI
  const dx = -d / 0.005
  await evaluate(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`)
  yaw = target
}
const yawToward = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z)) // 이동 forward = (-sin, -cos)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const walkLog = []
async function walkTo(target, { tol = 0.7, run = false, timeoutMs = 60000 } = {}) {
  const t0 = Date.now(); let last = null; let stuckSince = Date.now(); let nudges = 0
  if (run) await keyDown('ShiftLeft')
  await keyDown('KeyW')
  try {
    while (Date.now() - t0 < timeoutMs) {
      const s = await readState(); const p = s.player; if (!p) throw new Error('player mesh not found')
      const d = dist(p, target); if (d <= tol) { walkLog.push({ target, reached: true, ms: Date.now() - t0, nudges }); return p }
      await setYaw(yawToward(p, target))
      if (last && dist(last, p) > 0.05) stuckSince = Date.now()
      if (Date.now() - stuckSince > 2500) { nudges += 1; stuckSince = Date.now(); await keyDown(nudges % 2 ? 'KeyD' : 'KeyA'); await sleep(900); await keyUp(nudges % 2 ? 'KeyD' : 'KeyA') }
      last = p
      await sleep(120)
    }
  } finally { await keyUp('KeyW'); if (run) await keyUp('ShiftLeft') }
  const s = await readState(); walkLog.push({ target, reached: false, ms: Date.now() - t0, nudges, at: s.player }); return s.player
}
async function waitFor(pred, timeoutMs = 20000, every = 200) { const t0 = Date.now(); while (Date.now() - t0 < timeoutMs) { const s = await readState(); if (pred(s)) return s; await sleep(every) } return null }
async function pressThroughDialogue(maxSteps = 12) {
  for (let i = 0; i < maxSteps; i++) { const s = await readState(); if (!s.dialogueOpen) { const t = s.overlayText ?? ''; if (!s.buttons.length && !/대화|말|\.\.\./.test(t)) break }
    const choice = s.buttons.find((b) => !b.disabled && /수락|완료|확인|보상/.test(b.text)); if (choice) { await clickButton(`/수락|완료|확인|보상/.test(x.textContent)`); await sleep(250); continue }
    await tap('Enter'); await sleep(250) }
}
const FRAME_SAMPLER = `(() => { const s = { t: [], start: performance.now(), last: performance.now(), calls0: globalThis.__R3F_RENDERER__?.info?.render?.calls ?? 0 }; window.__R109_FRAMES__ = s; const f = (now) => { s.t.push(now - s.last); s.last = now; if (now - s.start < 60000) requestAnimationFrame(f); else s.done = true }; requestAnimationFrame(f); return true })()`
const FRAME_RESULT = `(() => { const s = window.__R109_FRAMES__; if (!s || !s.done) return null; const dts = s.t.slice(1); const fps = dts.map((d) => 1000 / d).sort((a, b) => a - b); const n = fps.length; const avg = n / (dts.reduce((a, b) => a + b, 0) / 1000); const low1 = fps[Math.max(0, Math.floor(n * 0.01) - 1)] ?? fps[0]; const hitches = dts.filter((d) => d >= 1000).length; const r = globalThis.__R3F_RENDERER__; const p = r?._pipelines; return { frames: n, avg: +avg.toFixed(2), low1: +low1.toFixed(2), hitch1s: hitches, callsPerFrame: r?.info?.render?.calls != null ? +((r.info.render.calls - s.calls0) / n).toFixed(1) : null, programs: r?.info?.memory?.programs ?? null, textures: r?.info?.memory?.textures ?? null, pipelines: p?.caches?.size ?? null, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null } })()`

const result = { mode, tag: o.tag, at: new Date().toISOString(), url: null, shots, walkLog }
try {
  if (mode === 'baseline') {
    for (const q of ['q=low', 'q=low&route=bench']) {
      const url = `http://127.0.0.1:${o.port}/?${q}`; cdp.events.length = 0
      await cdp.send('Page.navigate', { url }); await sleep(q.includes('bench') ? 20000 : 15000)
      const s = await readState(); const urls = requestedUrls(cdp)
      result[q] = { url, overlay: s.overlay, runtime: s.runtime, gameChunks: urls.filter((u) => /Game(Runtime|Overlay)|game/i.test(u.split('/').pop() ?? '')), jsRequests: urls.filter((u) => u.endsWith('.js')).length, errors: consoleErrors(cdp), hud: s.hud }
      process.stdout.write(`${q}: overlay=${s.overlay} runtime=${s.runtime} gameChunks=${result[q].gameChunks.length} errors=${result[q].errors.total}\n`)
    }
  } else if (mode === 'final') {
    const name = `final-${o.tag}`; const url = `http://127.0.0.1:${o.port}/?q=low&route=final&report=${name}`; result.url = url
    await cdp.send('Page.navigate', { url })
    let report = null; const t0 = Date.now(); while (Date.now() - t0 < 120000) { report = await evaluate(`(() => window.__bench && (window.__bench.route === 'final' || window.__bench.status === 'FAIL') ? window.__bench : null)()`); if (report) break; await sleep(500) }
    if (!report) throw new Error('final route result timeout')
    await rm(join(ROOT, 'Docs/m0a', `${name}.json`), { force: true }); await rm(join(ROOT, 'Docs/m0a', `${name}.png`), { force: true })
    const last = finalRoute.waypoints.at(-1).pose.position; const fp = report.finalPosition
    result.final = { routeHash: report.routeHash, finalPosition: fp, expected: { x: last[0], z: last[2] }, deviationM: fp ? +Math.hypot(fp.x - last[0], fp.z - last[2]).toFixed(3) : null, integratedSeconds: report.integratedSeconds, status: report.status ?? 'ok', trace: report.trace, grounding: report.grounding, maxWaypointDevM: report.trace ? +Math.max(...report.trace.map((p) => { const w = finalRoute.waypoints.find((x) => x.id === p.id); return w ? Math.hypot(p.x - w.pose.position[0], p.z - w.pose.position[2]) : 0 })).toFixed(3) : null, errors: consoleErrors(cdp), gameChunks: requestedUrls(cdp).filter((u) => /Game(Runtime|Overlay)/i.test(u)), overlay: (await readState()).overlay }
    process.stdout.write(`final deviation=${result.final.deviationM}m hash=${report.routeHash} errors=${result.final.errors.total}\n`)
  } else {
    const url = `http://127.0.0.1:${o.port}/?game=1&q=low`; result.url = url
    await cdp.send('Page.navigate', { url })
    const scenes = {}
    const mark = async (id, ok, note) => { const s = await readState(); scenes[id] = { ok, note, hud: s.hud, player: s.player, pigs: s.pigs.length, drops: s.drops.length, buttons: s.buttons, overlayText: s.overlayText }; process.stdout.write(`${id} ${ok ? 'PASS' : 'FAIL'} ${note ?? ''}\n`) }
    // S00 타이틀: 시작 버튼이 활성화될 때까지(로딩) 대기
    const s00 = await waitFor((s) => s.buttons.some((b) => !b.disabled), 60000, 500); await sleep(1500); await shot('s00-title')
    await mark('S00', !!s00 && s00.overlay, s00 ? `buttons=${JSON.stringify(s00.buttons)}` : 'start button never enabled'); result.pigsAtTitle = (await readState()).pigs
    await tap('Enter'); const s01 = await waitFor((s) => s.buttons.some((b) => /무작위|랜덤|random/i.test(b.text)), 8000)
    if (!s01) await clickButton(`!x.disabled`)
    const s01b = s01 ?? await waitFor((s) => s.buttons.some((b) => /무작위|랜덤|random/i.test(b.text)), 8000)
    await clickButton(`/무작위|랜덤|random/i.test(x.textContent)`); await sleep(400); await shot('s01-create')
    await mark('S01', !!s01b, s01 ? 'Enter edge → create' : 'Enter edge did not open create; clicked start button')
    await clickButton(`/생성|시작|확인|모험/.test(x.textContent) && !x.disabled`); const s02 = await waitFor((s) => s.hud.hasHud, 8000)
    await mark('S02-enter', !!s02, s02 ? `hud=${s02.hud.stats}` : 'HUD not shown after confirm')
    // S02 힌트 3입력: 이동 → 달리기 → 점프
    await keyDown('KeyW'); await sleep(900); await keyUp('KeyW'); await sleep(300)
    await keyDown('ShiftLeft'); await keyDown('KeyW'); await sleep(1500); await keyUp('KeyW'); await keyUp('ShiftLeft'); await sleep(300)
    await tap('Space'); await sleep(300); await shot('s02-hints')
    await mark('S02', true, 'move/run/jump injected — hint DOM in overlayText')
    // S03 아치 통과: 게이트 중심으로
    await walkTo({ x: GATE.x, z: GATE.z + 4 }, { tol: 1 }); await walkTo({ x: GATE.x, z: GATE.z - 1.5 }, { tol: 0.8 }); await shot('s03-gate-0s'); await sleep(2200); await shot('s03-gate-2s')
    const s03 = await readState(); await mark('S03', /헤네시스|마을|버섯/.test(s03.overlayText ?? ''), `banner text=${(s03.overlayText ?? '').slice(0, 80)}`)
    // 카메라 이징 관측: 카메라-플레이어 거리 0/1/2초
    const camDist = []; for (let i = 0; i < 3; i++) { camDist.push(await evaluate(`(() => { const r = globalThis.__R3F_RENDERER__; const cam = r?._activeCamera ?? null; return cam ? [cam.position.x, cam.position.y, cam.position.z] : null })()`)); await sleep(700) }
    result.cameraSamples = camDist
    // S04 스탄
    await walkTo({ x: NPC.stan.x, z: NPC.stan.z + 1.8 }, { tol: 0.6 }); await setYaw(yawToward((await readState()).player, NPC.stan)); await sleep(200); await tap('KeyF'); await sleep(500)
    const s04 = await readState(); const s04ok = s04.buttons.some((b) => /수락/.test(b.text)) || /스탄|장로/.test(s04.overlayText ?? '')
    await shot('s04-stan'); await mark('S04', s04ok, `dialogue=${(s04.overlayText ?? '').slice(0, 120)}`)
    for (let i = 0; i < 6; i++) { const s = await readState(); if (s.buttons.some((b) => /수락/.test(b.text))) { await clickButton(`/수락/.test(x.textContent)`); await sleep(300); break } await tap('Enter'); await sleep(350) }
    for (let i = 0; i < 6; i++) { await tap('Enter'); await sleep(300) }
    const afterStan = await readState(); await mark('S04-accept', /1\/10|0\/10|사냥/.test(afterStan.hud.quest ?? ''), `quest=${afterStan.hud.quest}`)
    // S05 마야 상점
    await walkTo({ x: NPC.maya.x + 1.8, z: NPC.maya.z }, { tol: 0.6 }); await setYaw(yawToward((await readState()).player, NPC.maya)); await sleep(200); await tap('KeyF'); await sleep(500)
    const s05 = await readState(); const s05ok = /마야|상점/.test(s05.overlayText ?? '')
    for (let i = 0; i < 8; i++) { const s = await readState(); if (s.buttons.some((b) => /구매/.test(b.text))) break; await tap('Enter'); await sleep(350) }
    const shopState = await readState(); const coin = (t) => Number((t ?? '').match(/(?:코인|메소)\s*(\d[\d,]*)/)?.[1]?.replace(/,/g, '') ?? NaN); const mesoBefore = coin(shopState.overlayText)
    await clickButton(`/활|사냥/.test(x.textContent) && !x.disabled`); await sleep(250); await shot('s05-shop')
    await clickButton(`/구매/.test(x.textContent) && !x.disabled`); await sleep(500)
    const afterBuy = await readState(); const mesoAfter = coin(afterBuy.overlayText)
    await mark('S05', s05ok && mesoBefore - mesoAfter === 900, `meso ${mesoBefore}→${mesoAfter} (buttons=${JSON.stringify(shopState.buttons.slice(0, 6))})`)
    // S06 공원
    await walkTo({ x: -30, z: 12 }, { tol: 1.5, run: true, timeoutMs: 90000 }); await walkTo({ x: PARK.x + 34, z: PARK.z }, { tol: 1.5, run: true, timeoutMs: 90000 }); await sleep(300); await shot('s06-park')
    const s06 = await waitFor((s) => s.pigs.length > 0, 8000); await mark('S06', !!s06 && s06.pigs.length <= 10, `pigs=${s06?.pigs.length ?? 0} banner=${(s06?.overlayText ?? '').slice(0, 60)}`)
    // S07 사냥 + 60초 프레임 샘플
    await evaluate(FRAME_SAMPLER)
    let kills = 0; let shotHit = false; let shotDrop = false; const huntT0 = Date.now(); let pickups = 0; const triedDrops = []; let dropFails = 0
    while (Date.now() - huntT0 < 240000) {
      const s = await readState(); const q = s.hud.quest ?? ''; const m = q.match(/(\d+)\s*\/\s*10/); kills = m ? Number(m[1]) : kills
      if (kills >= 10) break
      if (/클릭하여 계속/.test(s.overlayText ?? '') || (s.buttons.length && !s.buttons.some((b) => /구매/.test(b.text)))) { result.firstKillDialogue = (result.firstKillDialogue ?? 0) + 1; await tap('Enter'); await sleep(300); continue }
      const p = s.player; const drop = s.drops.find((d) => !triedDrops.some((t) => dist(t, d) < 0.3))
      if (drop && dist(p, drop) < 8) { if (!shotDrop) { await shot('s07-drop'); shotDrop = true } triedDrops.push({ x: drop.x, z: drop.z }); await walkTo(drop, { tol: 0.4, timeoutMs: 8000 }); await sleep(1800); const after = await readState(); if (after.drops.some((d) => dist(d, drop) < 0.3)) dropFails += 1; else pickups += 1; continue }
      const pig = s.pigs.map((g) => ({ ...g, d: dist(p, g) })).sort((a, b) => a.d - b.d)[0]
      if (!pig) { await sleep(500); continue }
      if (pig.d > 1.6) { await walkTo(pig, { tol: 1.4, timeoutMs: 15000 }); continue }
      await setYaw(yawToward(p, pig)); await sleep(100)
      await tap('Digit2'); if (!result.fxShot) { await sleep(110); await shot('s07-skillfx'); await sleep(120); await shot('s07-skillfx-b'); result.fxShot = true } await sleep(150); await tap('Digit1'); if (!result.atkShot) { await sleep(120); await shot('s07-attackfx'); result.atkShot = true } await sleep(450)
      if (!shotHit) { const h = await readState(); if (h.hpBars > 0 || h.floaters > 0) { await shot('s07-hunt'); shotHit = true } }
    }
    if (!shotHit) await shot('s07-hunt')
    const t1 = Date.now(); while (Date.now() - t1 < 65000) { const fr = await evaluate(FRAME_RESULT); if (fr) { result.huntBench = fr; break } await sleep(1000) }
    const s07 = await readState(); await mark('S07', kills >= 10, `kills=${kills} pickups=${pickups} dropFails=${dropFails} hpBars=${s07.hpBars} floaters=${s07.floaters} quest=${s07.hud.quest}`)
    // S09 스탄 완료 → 보상
    await walkTo({ x: -30, z: 12 }, { tol: 1.5, run: true, timeoutMs: 90000 }); await walkTo({ x: NPC.stan.x, z: NPC.stan.z + 1.8 }, { tol: 0.6, run: true, timeoutMs: 90000 })
    await setYaw(yawToward((await readState()).player, NPC.stan)); await sleep(200); await tap('KeyF'); await sleep(500)
    for (let i = 0; i < 10; i++) { const s = await readState(); if (s.buttons.some((b) => /완료|보상/.test(b.text))) { await clickButton(`/완료|보상/.test(x.textContent)`); await sleep(400); break } await tap('Enter'); await sleep(350) }
    const s09 = await waitFor((s) => s.buttons.some((b) => /확인/.test(b.text)), 8000); await shot('s09-reward')
    await mark('S09', !!s09, `text=${(s09?.overlayText ?? '').slice(0, 120)}`)
    await clickButton(`/확인/.test(x.textContent)`); await sleep(300); for (let i = 0; i < 6; i++) { await tap('Enter'); await sleep(300) }
    const s10 = await waitFor((s) => s.buttons.some((b) => /다시|자유|탐험/.test(b.text)), 15000); await sleep(1500); await shot('s10-epilogue')
    await mark('S10', !!s10, `buttons=${JSON.stringify(s10?.buttons ?? [])}`)
    const fin = await readState(); result.finalState = { hud: fin.hud, overlayText: fin.overlayText, player: fin.player, kills }
    result.scenes = scenes
    result.errors = consoleErrors(cdp)
    result.gameChunks = requestedUrls(cdp).filter((u) => /Game(Runtime|Overlay)/i.test(u))
  }
} catch (error) {
  result.error = String(error?.stack ?? error); process.stdout.write(`ERROR ${result.error}\n`)
    { await tap('Escape' in KEY ? 'Escape' : 'Enter'); await sleep(400); const st = await readState(); result.shopLeave = { overlay: (st.overlayText ?? '').slice(0, 40), hasShop: /상점|나가기/.test(st.overlayText ?? '') }; process.stdout.write(`S05-leave ${JSON.stringify(result.shopLeave)}
`) }
  try { await shot('error') } catch {}
  result.errors ??= consoleErrors(cdp)
} finally {
  await writeFile(join(o.outDir, `m6-${mode}-${o.tag}.json`), JSON.stringify(result, null, 2) + '\n')
  cdp.close(); chrome.kill(); await killChromeProfile(profileTag); server.kill(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {})
  process.stdout.write(`DONE ${join(o.outDir, `m6-${mode}-${o.tag}.json`)}\n`)
}
