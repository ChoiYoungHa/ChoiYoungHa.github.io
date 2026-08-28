// 2026-08-28 코덱스 드레싱 캡처 프로브(dev 5173): 광장·데크·덩굴·우물·텃밭을 마을 안에서 찍는다.
// 사용: node Automation/dress-probe.mjs [outDir] [tag] [baseUrl]
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/feedback-0828'; const TAG = process.argv[3] ?? 'd1'; const BASE = process.argv[4] ?? 'http://localhost:5173/'
const profile = join(tmpdir(), `web3d-dress-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
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
const KEY = { KeyW: ['w', 87], KeyA: ['a', 65], KeyD: ['d', 68] }
const keyDown = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300) } return false }
let yaw = 0
const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`); yaw = t }
const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, dressing: {}, ground: false }; if (!s) return JSON.stringify(out); s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z }; if (o.name === 'codex-dressing') out.dressing.merged = o.geometry.index ? o.geometry.index.count / 3 : 0; if (o.name === 'ground-dressing') out.ground = true }); return JSON.stringify(out) })()`
const walkTo = async (t, tol = 1.5, timeoutMs = 60000) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; await keyDown('KeyW'); try { while (Date.now() - t0 < timeoutMs) { const s = JSON.parse(await ev(READ)); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'KeyD' : 'KeyA'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(120) } } finally { await keyUp('KeyW') } }

await send('Page.navigate', { url: `${BASE}?game=1&net=0&scene=hunt&q=base` })
await waitFor(`!!document.querySelector('[aria-label="게임 HUD"]') && !!globalThis.__R3F_SCENE__`, 90000); await sleep(4000)
console.log('state', await ev(READ))
const look = async (at, name) => { await setYaw(yawToward(JSON.parse(await ev(READ)).player, at)); await sleep(700); await shot(name) }
await walkTo({ x: 3, z: 1 }, 1.2, 40000); await look({ x: -4, z: 11 }, 'plaza')
await look({ x: -8.8, z: 18.6 }, 'deck'); await look({ x: 10, z: 20 }, 'vine-house-a')
await walkTo({ x: 4, z: 6 }, 1.2, 40000); await look({ x: 2.5, z: 8 }, 'well'); await look({ x: -15, z: 6 }, 'vine-house-west')
await walkTo({ x: 14, z: 4 }, 1.5, 60000); await look({ x: 20, z: 4 }, 'farm')
console.log('errors', JSON.stringify(errors.slice(0, 5)))
ws.close(); chrome.kill()
