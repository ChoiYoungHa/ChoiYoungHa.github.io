// 2026-08-28 HUD/퀵슬롯/스탯창 프로브(dev 5173): 퀵슬롯 6개·키 안내·C 스탯창·I 인벤토리(물약 구매 후 퀵슬롯 등록 버튼)·4번 키 사용을 실측한다.
// 사용: node Automation/ui-probe.mjs [outDir] [tag] [baseUrl]
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/feedback-0828'; const TAG = process.argv[3] ?? 'ui1'; const BASE = process.argv[4] ?? 'http://localhost:5173/'
const profile = join(tmpdir(), `web3d-ui-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
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
const KEY = { ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], KeyC: ['c', 67], KeyI: ['i', 73], KeyF: ['f', 70], Digit4: ['4', 52], Enter: ['Enter', 13], Escape: ['Escape', 27] }
const keyDown = (code) => send('Input.dispatchKeyEvent', { type: KEY[code][0].length === 1 ? 'keyDown' : 'rawKeyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const tap = async (code) => { await keyDown(code); await sleep(60); await keyUp(code); await sleep(250) }
const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300) } return false }
let yaw = 0
const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`); yaw = t }
const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null }; if (!s) return JSON.stringify(out); s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z } }); return JSON.stringify(out) })()`
const walkTo = async (t, tol = 1.5, timeoutMs = 60000) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; await keyDown('ArrowUp'); try { while (Date.now() - t0 < timeoutMs) { const s = JSON.parse(await ev(READ)); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'ArrowRight' : 'ArrowLeft'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(120) } } finally { await keyUp('ArrowUp') } }
const DOM = `JSON.stringify({ slots: [...document.querySelectorAll('[aria-label="퀵슬롯"] > div')].length, legend: document.querySelector('[aria-label="키 안내"]')?.textContent ?? null, stats: !!document.querySelector('[aria-label="스탯창"]'), inv: !!document.querySelector('[aria-label*="인벤토리"]'), bind: [...document.querySelectorAll('[aria-label="퀵슬롯 등록"] button')].map((b) => b.textContent), hp: document.querySelector('[aria-label="캐릭터 상태"]')?.textContent?.slice(0, 60), qty: [...document.querySelectorAll('[aria-label^="수량"]')].map((e) => e.textContent) })`
const CLICK = (re) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && ${re}.test(x.textContent)); if (!b) return false; b.click(); return true })()`

await send('Page.navigate', { url: `${BASE}?game=1&net=0&scene=hunt&q=low` })
await waitFor(`!!document.querySelector('[aria-label="게임 HUD"]') && !!globalThis.__R3F_SCENE__`, 60000); await sleep(2500)
console.log('hud', await ev(DOM)); await shot('hud-6slots')
await tap('KeyC'); await sleep(400); console.log('stats', await ev(DOM)); await shot('stats-panel'); await tap('Escape')
// 마야에게 가서 상점 → HP 물약(소) 구매 → I → 물약 hover → 퀵슬롯 4 등록 → 4 키
const maya = { x: -5.45, z: 17.66 }
await walkTo({ x: maya.x, z: maya.z + 2.0 }, 0.7, 60000); await setYaw(yawToward(JSON.parse(await ev(READ)).player, maya)); await sleep(200)
await tap('KeyF')
const HAS_SHOP = `[...document.querySelectorAll('button')].some((b) => /물약/.test(b.textContent))`
for (let i = 0; i < 12; i++) { if (await ev(HAS_SHOP)) break; await tap('Enter') }
const MESO = `document.querySelector('[aria-label^="메소"], [aria-label^="코인"]')?.getAttribute('aria-label') ?? null`
console.log('shop', await ev(`JSON.stringify([...document.querySelectorAll('button')].map((b) => b.textContent.trim().slice(0, 16)))`), await ev(MESO))
await ev(CLICK('/HP 물약 \\(소\\)/')); await sleep(400)
console.log('detail', await ev(`JSON.stringify([...document.querySelectorAll('button')].filter((b) => /구매/.test(b.textContent)).map((b) => [b.textContent.trim(), b.disabled]))`))
await ev(CLICK('/구매/')); await sleep(700); console.log('meso-after', await ev(MESO))
console.log('after-buy', await ev(DOM))
await tap('Escape'); await sleep(300)
await tap('KeyI'); await sleep(400)
const hovered = await ev(`(() => { const cells = [...document.querySelectorAll('[aria-label*="인벤토리"] button')]; const c = cells.find((b) => b.querySelector('img[src*="potion"]')); if (!c) return false; c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true })()`)
await sleep(300); console.log('inventory', hovered, await ev(DOM)); await shot('inventory-bind')
await ev(`(() => { const b = [...document.querySelectorAll('[aria-label="퀵슬롯 등록"] button')].find((x) => x.textContent === '4'); if (b) b.click(); return !!b })()`); await sleep(300)
await tap('Escape'); await sleep(300); console.log('bound', await ev(DOM)); await shot('quickslot-bound')
await tap('Digit4'); await sleep(400); console.log('after-use', await ev(DOM)); await shot('quickslot-used')
console.log('errors', JSON.stringify(errors.slice(0, 5)))
ws.close(); chrome.kill()
