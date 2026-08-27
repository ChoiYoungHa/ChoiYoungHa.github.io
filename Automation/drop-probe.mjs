// 2026-08-28 드롭 3D 모델 확인 프로브: dev 5173 ?game=1&net=0&scene=hunt 에서 가장 가까운 돼지를 잡고 드롭이 생기면 즉시 캡처한다.
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/codex-assets'; const TAG = process.argv[3] ?? 'r1'
const profile = join(tmpdir(), `web3d-dropprobe-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300)); return } const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
const shot = async (name) => { const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(OUT, `${name}-${TAG}.png`), Buffer.from(sh.data, 'base64')) }
const KEY = { KeyW: ['w', 87], KeyA: ['a', 65], KeyD: ['d', 68], Digit1: ['1', 49], ShiftLeft: ['Shift', 16] }
const keyDown = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
let yaw = 0
const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`); yaw = t }
const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, pigs: [], drops: [] }; s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z }; if (o.isInstancedMesh && o.parent?.name === 'm6-game-runtime') { const list = []; for (let i = 0; i < o.count; i++) { const e = o.instanceMatrix.array, k = i * 16; list.push({ x: e[k + 12], y: e[k + 13], z: e[k + 14], s: Math.hypot(e[k], e[k + 1], e[k + 2]) }) } if (/^drops-/.test(o.name)) out.drops.push(...list.map((d) => ({ ...d, mesh: o.name }))); else if (o.instanceMatrix.count === 10) out.pigs = list } }); return JSON.stringify(out) })()`
await send('Page.navigate', { url: 'http://localhost:5173/?game=1&net=0&scene=hunt&q=base' }); await sleep(14000)
const walkTo = async (t, tol = 1.5, timeoutMs = 60000) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; await keyDown('KeyW'); try { while (Date.now() - t0 < timeoutMs) { const s = JSON.parse(await ev(READ)); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'KeyD' : 'KeyA'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(120) } } finally { await keyUp('KeyW') } }
await walkTo({ x: -30, z: 12 }); await walkTo({ x: -60, z: 8 })
const t0 = Date.now(); let walking = false; let found = null
while (Date.now() - t0 < 120000) {
  const s = JSON.parse(await ev(READ)); if (!s.player) { await sleep(300); continue }
  if (s.drops.length > 0) { found = s.drops; if (walking) { await keyUp('KeyW'); walking = false } const d = s.drops[0]; await setYaw(yawToward(s.player, d)); await sleep(250); await shot('s07-drop3d'); await sleep(1500); await shot('s07-drop3d-b'); break }
  const pig = s.pigs.map((g) => ({ ...g, d: dist(s.player, g) })).sort((a, b) => a.d - b.d)[0]; if (!pig) { await sleep(300); continue }
  if (pig.d > 1.6) { await setYaw(yawToward(s.player, pig)); if (!walking) { await keyDown('KeyW'); walking = true } await sleep(150); continue }
  if (walking) { await keyUp('KeyW'); walking = false }
  await setYaw(yawToward(s.player, pig)); await keyDown('Digit1'); await sleep(60); await keyUp('Digit1'); await sleep(400)
}
await shot('s07-drop3d-end'); console.log('quest', await ev("document.querySelector('[aria-label=\"퀘스트 추적\"]')?.textContent"), 'last', JSON.stringify(JSON.parse(await ev(READ))).slice(0,300)); console.log('drops', JSON.stringify(found)?.slice(0, 400), 'errors', JSON.stringify(errors.slice(0, 5)))
ws.close(); chrome.kill()
