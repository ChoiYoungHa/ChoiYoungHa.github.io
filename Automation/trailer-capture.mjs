// 2026-08-28 트레일러 캡처(dev 5173): CDP Page.startScreencast 로 프레임을 받으며 타이틀→생성→숲 진입→마을(광장·촌장·상점)→멀티플레이 동행→공원 사냥→보스전→엔드카드 순으로 진행한다.
// 산출: <out>/frames/f000001.jpg … + <out>/frames.json(타임스탬프·장면 마커). 인코딩은 Automation/trailer-encode.py(Blender).
// 사용: node Automation/trailer-capture.mjs [outDir] [baseUrl]
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/trailer/capture'; const BASE = process.argv[3] ?? 'http://localhost:5173/'
const W = 1600, H = 900
const ROOM = `trailer${Date.now().toString(36).slice(-5)}`
await mkdir(join(OUT, 'frames'), { recursive: true })

async function launch(label, w = W, h = H, dsf = 1) {
  const profile = join(tmpdir(), `web3d-trailer-${label}-${Date.now()}`); await mkdir(profile, { recursive: true })
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${w},${h}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', windowsHide: true })
  let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
  let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let id = 0; const pending = new Map(); const errors = []; const handlers = {}
  ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 200)); handlers[m.method]?.(m.params); return } const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; const timer = setTimeout(() => { if (pending.delete(i)) reject(new Error('CDP timeout ' + method)) }, 20000); pending.set(i, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } }); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Page.enable'); await send('Runtime.enable')
  // base 프리셋 스테이지는 CSS 1067×600(백킹 1600×900, dprCap 1.5) — 뷰포트를 그 크기로 두고 DPR 1.5 로 찍어야 프레임(1600×900)이 꽉 찬다.
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dsf, mobile: false })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
  const KEY = { ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], ArrowDown: ['ArrowDown', 40], KeyF: ['f', 70], KeyI: ['i', 73], KeyC: ['c', 67], Digit1: ['1', 49], Digit2: ['2', 50], Digit4: ['4', 52], Space: [' ', 32], ShiftLeft: ['Shift', 16], Enter: ['Enter', 13], Escape: ['Escape', 27] }
  const down = new Set()
  const keyDown = (code) => { down.add(code); return send('Input.dispatchKeyEvent', { type: KEY[code][0].length === 1 ? 'keyDown' : 'rawKeyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1], modifiers: down.has('ShiftLeft') ? 8 : 0 }) }
  const keyUp = (code) => { down.delete(code); return send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] }) }
  const tap = async (code, hold = 60) => { await keyDown(code); await sleep(hold); await keyUp(code) }
  const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(250) } return false }
  let yaw = 0
  const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 533, clientY: 300 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 533 + (${dx}), clientY: 300 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 533 + (${dx}), clientY: 300 })); return true })()`); yaw = t }
  const sweepYaw = async (to, ms) => { const from = yaw; const steps = Math.max(1, Math.round(ms / 50)); for (let i = 1; i <= steps; i++) { await setYaw(from + (to - from) * (i / steps)); await sleep(50) } }
  const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
  const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, pigs: [], boss: null, text: (document.querySelector('[data-game-overlay]')?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 120) }; if (!s) return JSON.stringify(out); s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z }; if (o.isInstancedMesh && o.parent?.name === 'm6-game-runtime' && o.instanceMatrix.count === 10) { for (let i = 0; i < o.count; i++) { const e = o.instanceMatrix.array, k = i * 16; out.pigs.push({ x: e[k + 12], z: e[k + 14] }) } } if (o.name === 'boss-the-eleventh') out.boss = { visible: o.visible, x: o.position.x, z: o.position.z } }); return JSON.stringify(out) })()`
  const read = async () => JSON.parse(await ev(READ))
  const walkTo = async (t, { tol = 1.5, run = false, timeoutMs = 60000 } = {}) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; if (run) await keyDown('ShiftLeft'); await keyDown('ArrowUp'); try { while (Date.now() - t0 < timeoutMs) { const s = await read(); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'ArrowRight' : 'ArrowLeft'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(100) } } finally { await keyUp('ArrowUp'); if (run) await keyUp('ShiftLeft') } }
  const CLICK = (re) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && ${re}.test(x.textContent)); if (!b) return false; b.click(); return true })()`
  // 트레일러 오버레이(카드·자막) — 게임 DOM 위에 주입
  const overlay = async (html, opts = {}) => ev(`(() => { let el = document.getElementById('trailer-overlay'); if (!el) { el = document.createElement('div'); el.id = 'trailer-overlay'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;font-family:"Segoe UI",system-ui,sans-serif;color:#f5f0e4;'; document.body.appendChild(el) } el.innerHTML = ${JSON.stringify(html)}; el.style.opacity = ${opts.opacity ?? 1}; el.style.transition = 'opacity ${opts.fadeMs ?? 500}ms ease'; return true })()`)
  const fadeOverlay = async (opacity) => ev(`(() => { const el = document.getElementById('trailer-overlay'); if (el) el.style.opacity = ${opacity}; return true })()`)
  const card = (title, sub, dark = 0.72) => `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(8,10,14,${dark * 0.7}) 0%, rgba(8,10,14,${dark}) 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 4px 28px rgba(0,0,0,.9)"><div style="font-size:68px;letter-spacing:.14em;font-weight:800">${title}</div>${sub ? `<div style="margin-top:18px;font-size:24px;letter-spacing:.32em;color:#e8c37a">${sub}</div>` : ''}<div style="margin-top:34px;width:180px;height:1px;background:linear-gradient(90deg,transparent,#c9a94a,transparent)"></div></div>`
  const caption = (text, sub = '') => `<div style="position:absolute;left:64px;bottom:150px;text-shadow:0 3px 16px rgba(0,0,0,.95)"><div style="font-size:34px;font-weight:800;letter-spacing:.1em">${text}</div>${sub ? `<div style="margin-top:6px;font-size:16px;letter-spacing:.2em;color:#e8c37a">${sub}</div>` : ''}<div style="margin-top:10px;width:120px;height:2px;background:#c9a94a"></div></div>`
  const resetYaw = () => { yaw = 0 } // 페이지 재로드(컷) 뒤 카메라 yaw 는 0 — 누적값을 같이 리셋해야 방향이 맞는다(2026-08-28 실측: 리셋 없이는 월드 끝까지 걸어감)
  return { label, chrome, ws, send, ev, tap, keyDown, keyUp, waitFor, setYaw, sweepYaw, resetYaw, yawToward, dist, read, walkTo, CLICK, overlay, fadeOverlay, card, caption, handlers, errors, get yaw() { return yaw } }
}

// ── 스크린캐스트 ──
const frames = []; let frameIndex = 0; const markers = []
let cast = null
const startCast = async (page) => {
  cast = page
  page.handlers['Page.screencastFrame'] = async (p) => {
    frameIndex += 1
    const name = `f${String(frameIndex).padStart(6, '0')}.jpg`
    await writeFile(join(OUT, 'frames', name), Buffer.from(p.data, 'base64'))
    frames.push({ name, t: p.metadata.timestamp })
    try { await page.send('Page.screencastFrameAck', { sessionId: p.sessionId }) } catch { /* 페이지 이동 중 */ }
  }
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 84, maxWidth: W, maxHeight: H, everyNthFrame: 2 })
}
const stopCast = async () => { if (cast) { try { await cast.send('Page.stopScreencast') } catch { /* ignore */ } cast.handlers['Page.screencastFrame'] = null; cast = null } }
const LOG = join(OUT, 'capture.log'); const logLine = (line) => { try { fs.appendFileSync(LOG, line + String.fromCharCode(10)) } catch {} }
const mark = (name) => { markers.push({ name, frame: frameIndex, at: Date.now() }); const line = `[${new Date().toISOString().slice(11, 19)}] ${name} @frame ${frameIndex}`; console.log(line); logLine(line) }

const A = await launch('A', 1600, 900, 1)
const HUD = `!!document.querySelector('[aria-label="게임 HUD"]') && !!globalThis.__R3F_SCENE__`
const NO_DIALOGUE = `!/클릭하여 계속/.test(document.querySelector('[data-game-overlay]')?.textContent ?? '')`

// ① 타이틀 화면 + 오프닝 카드
await A.send('Page.navigate', { url: `${BASE}?game=1&q=base&dpr=1&room=${ROOM}` })
await A.waitFor(`[...document.querySelectorAll('button')].some((x) => !x.disabled && /시작/.test(x.textContent))`, 120000); await sleep(1500)
console.log('viewport', await A.ev('JSON.stringify({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio, stage: (() => { const s = document.querySelector("[data-game-overlay]")?.parentElement; const b = s?.getBoundingClientRect(); return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null })() })'))
if (process.env.TRAILER_PROBE === '1') { A.ws.close(); A.chrome.kill(); process.exit(0) }
await startCast(A); mark('title')
await sleep(2500)
await A.overlay(A.card('헤네시스: 첫 여행자', 'WEB 3D RPG · WebGPU · 멀티플레이', 0.62), { opacity: 0, fadeMs: 700 }); await sleep(60); await A.fadeOverlay(1); await sleep(3200); await A.fadeOverlay(0); await sleep(800); await A.overlay('')
// ② 시작 → 생성 → 입장
mark('create'); await A.ev(A.CLICK('/시작/')); await sleep(1800)
await A.overlay(A.caption('전사를 만들고, 마을로', '캐릭터 생성'), { opacity: 0 }); await sleep(60); await A.fadeOverlay(1); await sleep(1800); await A.fadeOverlay(0)
await A.ev(A.CLICK('/생성|시작|확인|모험/')); await A.waitFor(HUD, 20000); await sleep(300); await A.overlay('')
mark('forest'); await sleep(2600) // 자막 1
await A.keyDown('ArrowUp'); await sleep(2600); await A.keyUp('ArrowUp') // 자막 2 동안 전진
// ③ 멀티플레이 동행: B 가 같은 방에 들어와 A 앞에 선다
const B = await launch('B', 1280, 720)
await B.send('Page.navigate', { url: `${BASE}?game=1&scene=hunt&q=low&room=${ROOM}` })
const bReady = B.waitFor(HUD, 60000)
await stopCast(); await A.walkTo({ x: -1, z: 16.5 }, { tol: 1.2 }); await bReady; await startCast(A)
await A.sweepYaw(A.yaw + 0.6, 1200); await A.sweepYaw(A.yaw - 1.2, 2200); await A.sweepYaw(A.yaw + 0.6, 1200)
await B.walkTo({ x: 0.5, z: 19.5 }, { tol: 1.0, timeoutMs: 40000 })
mark('multiplayer'); const a0 = await A.read(); await A.setYaw(A.yawToward(a0.player, { x: 0.5, z: 19.5 })); await A.overlay(A.caption('친구와 함께', '실시간 멀티플레이 · 같은 방 URL 공유'), { opacity: 0 }); await sleep(60); await A.fadeOverlay(1)
await B.keyDown('ArrowLeft'); await sleep(900); await B.keyUp('ArrowLeft'); await B.tap('Space'); await sleep(900); await B.keyDown('ArrowRight'); await sleep(900); await B.keyUp('ArrowRight'); await sleep(600)
await A.fadeOverlay(0); await sleep(500); await A.overlay('')
// ④ 광장·촌장 오릭
mark('village'); await A.overlay(A.caption('버섯마을', '광장 · 우물 · 상점'), { opacity: 0 }); await sleep(60); await A.fadeOverlay(1)
await A.walkTo({ x: 3, z: 1.5 }, { tol: 1.2 }); await A.sweepYaw(A.yawToward((await A.read()).player, { x: -4, z: 11 }), 900); await sleep(1400); await A.fadeOverlay(0); await sleep(300); await A.overlay('')
const stan = { x: -4.1, z: 3.28 }
await A.walkTo({ x: stan.x, z: stan.z + 1.8 }, { tol: 0.6 }); await A.setYaw(A.yawToward((await A.read()).player, stan)); await sleep(300)
mark('stan'); await A.tap('KeyF'); await sleep(1800); await A.tap('Enter'); await sleep(1600); await A.tap('Enter'); await sleep(1400)
for (let i = 0; i < 4; i++) { if (await A.ev(`[...document.querySelectorAll('button')].some((b) => /수락/.test(b.textContent))`)) { await A.ev(A.CLICK('/수락/')); await sleep(1500); break } await A.tap('Enter'); await sleep(1000) }
await A.tap('Enter'); await sleep(900); await A.tap('Enter'); await sleep(900)
// ⑤ 상점(마야)
const maya = { x: -5.45, z: 17.66 }
await A.walkTo({ x: maya.x, z: maya.z + 2.0 }, { tol: 0.7 }); await A.setYaw(A.yawToward((await A.read()).player, maya)); await sleep(200)
mark('shop'); await A.tap('KeyF'); for (let i = 0; i < 10; i++) { if (await A.ev(`[...document.querySelectorAll('button')].some((b) => /물약/.test(b.textContent))`)) break; await A.tap('Enter'); await sleep(700) }
await sleep(900); await A.ev(A.CLICK('/HP 물약 \\(소\\)/')); await sleep(900); await A.ev(A.CLICK('/구매/')); await sleep(1200); await A.tap('Escape'); await sleep(400)
await A.tap('KeyI'); await sleep(1200); await A.tap('Escape'); await sleep(300)
B.ws.close(); B.chrome.kill()
// ⑥ 공원 사냥 — 컷: 공원 진입 상태로 재로드
await stopCast(); mark('cut-park')
await A.send('Page.navigate', { url: `${BASE}?game=1&net=0&scene=hunt&q=base&dpr=1` }); await A.waitFor(HUD, 60000); await sleep(800); A.resetYaw()
await A.walkTo({ x: -30, z: 12 }, { run: true }); await A.walkTo({ x: -62, z: 8 }, { run: true })
await startCast(A); mark('park')
await A.overlay(A.caption('분홍갈기 공원', '돼지 사냥 · 스킬 · 드롭'), { opacity: 0 }); await sleep(60); await A.fadeOverlay(1)
const t0 = Date.now(); let kills = 0
while (Date.now() - t0 < 26000) {
  const s = await A.read()
  if (/클릭하여 계속/.test(s.text)) { await A.tap('Enter'); await sleep(400); continue }
  const pig = s.pigs.map((g) => ({ ...g, d: A.dist(s.player, g) })).sort((a, b) => a.d - b.d)[0]
  if (!pig) { await sleep(300); continue }
  if (pig.d > 1.7) { await A.walkTo(pig, { tol: 1.5, timeoutMs: 8000 }); continue }
  await A.setYaw(A.yawToward(s.player, pig)); await A.tap('Digit2'); await sleep(350); await A.tap('Digit1'); await sleep(500); await A.tap('Digit1'); await sleep(500)
  kills += 1
}
await A.fadeOverlay(0); await sleep(300); await A.overlay('')
// ⑦ 보스전 — 컷: 보스 즉시 각성 상태로 재로드
await stopCast(); mark('cut-boss')
await A.send('Page.navigate', { url: `${BASE}?game=1&net=0&scene=hunt&boss=1&q=base&dpr=1` }); await A.waitFor(HUD, 60000); await sleep(800); A.resetYaw()
await A.walkTo({ x: -30, z: 12 }, { run: true }); await A.walkTo({ x: -60, z: 8 }, { run: true })
// 둥지(-104,8) 17m 이내 도착을 실제로 확인한 뒤에만 캡처 시작(캡처 부하로 이동이 느려져 감지 반경 밖에서 끝나던 결함).
const NEST = { x: -104, z: 8 }
for (let i = 0; i < 6; i++) { const p = (await A.read()).player; if (p && A.dist(p, NEST) <= 17) break; await A.walkTo({ x: -88, z: 9 }, { run: true, tol: 2, timeoutMs: 40000 }) }
{ const l = 'boss-arrive ' + JSON.stringify(await A.read()); console.log(l); logLine(l) }
await startCast(A); mark('boss')
await A.setYaw(A.yawToward((await A.read()).player, { x: -104, z: 8 })); await A.overlay(A.caption('제1막 보스 · 열한 번째', '리본을 묶은 회청색 거대 돼지'), { opacity: 0 }); await sleep(60); await A.fadeOverlay(1); await sleep(1500)
const t1 = Date.now(); let lastLog = 0
while (Date.now() - t1 < 32000) {
  const s = await A.read()
  if (Date.now() - lastLog > 4000) { lastLog = Date.now(); { const l = 'boss-loop ' + JSON.stringify({ player: s.player, boss: s.boss, text: s.text.slice(0, 40) }); console.log(l); logLine(l) } }
  if (/클릭하여 계속/.test(s.text)) { await A.tap('Enter'); await sleep(300); continue }
  if (s.boss && s.boss.visible) {
    const d = A.dist(s.player, s.boss)
    if (d > 3.4) { await A.setYaw(A.yawToward(s.player, s.boss)); if (Date.now() - t1 > 8000) await A.walkTo(s.boss, { tol: 3.0, run: true, timeoutMs: 3000 }); else await sleep(400); continue } // 8초 기다린 뒤엔 직접 다가간다
    await A.setYaw(A.yawToward(s.player, s.boss)); await A.tap('Digit1'); await sleep(350); await A.tap('Digit2'); await sleep(500); await A.tap('Digit4'); await sleep(300)
  } else await sleep(300)
}
await A.fadeOverlay(0); await sleep(300)
// ⑧ 엔드 카드
mark('end'); await A.overlay(A.card('지금 플레이하세요', 'choiyoungha.github.io · Chrome / Edge (WebGPU)', 0.86), { opacity: 0, fadeMs: 900 }); await sleep(60); await A.fadeOverlay(1); await sleep(4200)
await stopCast(); mark('done')
await writeFile(join(OUT, 'frames.json'), JSON.stringify({ width: W, height: H, frames, markers, room: ROOM, errors: A.errors.slice(0, 10) }, null, 1))
console.log('frames', frames.length, 'errorsA', JSON.stringify(A.errors.slice(0, 5)))
A.ws.close(); A.chrome.kill()
