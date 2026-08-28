// 2026-08-28 영하님 피드백 검증 프로브(dev 5173): ①시작 자막 vs 스탯창 겹침 ②NPC idle 본 움직임 ④돼지 시선(추격 중 플레이어 향함)+캡처.
// 사용: node Automation/feedback-probe.mjs [outDir] [tag] [baseUrl]
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/feedback-0828'; const TAG = process.argv[3] ?? 'r1'; const BASE = process.argv[4] ?? 'http://localhost:5173/'
const profile = join(tmpdir(), `web3d-fb-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
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
const KEY = { ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Digit1: ['1', 49] }
const keyDown = (code) => send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300) } return false }
let yaw = 0
const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`); yaw = t }
const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, pigs: [] }; s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z }; if (o.isInstancedMesh && o.parent?.name === 'm6-game-runtime' && o.instanceMatrix.count === 10) { for (let i = 0; i < o.count; i++) { const e = o.instanceMatrix.array, k = i * 16; out.pigs.push({ x: e[k + 12], z: e[k + 14], fx: e[k + 8], fz: e[k + 10] }) } } }); return JSON.stringify(out) })()`
const walkTo = async (t, tol = 1.5, timeoutMs = 60000) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; await keyDown('ArrowUp'); try { while (Date.now() - t0 < timeoutMs) { const s = JSON.parse(await ev(READ)); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'ArrowRight' : 'ArrowLeft'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(120) } } finally { await keyUp('ArrowUp') } }
const facingOf = (s) => { const near = s.pigs.map((g) => ({ ...g, d: dist(s.player, g) })).sort((a, b) => a.d - b.d)[0]; if (!near) return null; const dx = s.player.x - near.x, dz = s.player.z - near.z, len = Math.hypot(dx, dz) || 1; const fl = Math.hypot(near.fx, near.fz) || 1; return { d: +near.d.toFixed(2), dot: +(((near.fx / fl) * (dx / len)) + ((near.fz / fl) * (dz / len))).toFixed(3), near } }

// ① 타이틀 → 생성 → 입장 직후 자막·스탯창 겹침 실측
await send('Page.navigate', { url: `${BASE}?game=1&net=0&q=low` })
await waitFor(`[...document.querySelectorAll('button')].some((x) => !x.disabled)`, 90000); await sleep(1500)
const CLICK = (re) => `(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && ${re}.test(x.textContent)); if (!b) return false; b.click(); return true })()`
for (let i = 0; i < 4; i++) { await ev(CLICK('/시작|start/i')); await sleep(1200); await ev(CLICK('/생성|시작|확인|모험/')); if (await waitFor(`!!document.querySelector('[aria-label="게임 HUD"]')`, 8000)) break }
await sleep(1500)
const overlap = await ev(`(() => { const st = document.querySelector('[aria-label="캐릭터 상태"]')?.getBoundingClientRect(); const sub = document.querySelector('p[aria-live="polite"]')?.getBoundingClientRect(); if (!st || !sub) return JSON.stringify({ st: !!st, sub: !!sub }); const ov = !(sub.bottom <= st.top || sub.top >= st.bottom || sub.right <= st.left || sub.left >= st.right); return JSON.stringify({ overlap: ov, sub: [Math.round(sub.top), Math.round(sub.bottom)], stats: [Math.round(st.top), Math.round(st.bottom)], text: document.querySelector('p[aria-live="polite"]')?.textContent?.slice(0, 40) }) })()`)
console.log('subtitle', overlap); await shot('start-subtitle')

// ② NPC idle: 스탄·마야 본 월드 위치를 0.7초 간격 3회 샘플 — 변하면 애니메이션 중
const BONE = `(() => { const s = globalThis.__R3F_SCENE__; const out = {}; for (const n of ['stan', 'maya']) { const g = s.getObjectByName('npc-' + n); let b = null; g?.traverse((o) => { if (!b && o.isBone && /head|spine2|neck/i.test(o.name)) b = o }); if (!b) g?.traverse((o) => { if (!b && o.isBone) b = o }); if (b) { const v = new (b.position.constructor)(); b.getWorldPosition(v); out[n] = [v.x, v.y, v.z].map((x) => +x.toFixed(4)) } } return JSON.stringify(out) })()`
const b0 = JSON.parse(await ev(BONE)); await sleep(700); const b1 = JSON.parse(await ev(BONE)); await sleep(700); const b2 = JSON.parse(await ev(BONE))
const moved = (n) => !!(b0[n] && b1[n] && b2[n]) && (Math.hypot(...b0[n].map((v, i) => v - b1[n][i])) > 1e-4 || Math.hypot(...b1[n].map((v, i) => v - b2[n][i])) > 1e-4)
console.log('npc-idle', JSON.stringify({ stan: moved('stan'), maya: moved('maya'), b0, b1 }))
await walkTo({ x: -5, z: 12 }, 2.5, 30000); await setYaw(yawToward(JSON.parse(await ev(READ)).player, { x: -7.5, z: 4 })); await sleep(400); await shot('npc-idle')

// ④ 돼지 시선: 공원까지 이동 → 추격당하는 동안 돼지 정면벡터(fx,fz)와 플레이어 방향의 내적(1 = 정면)
await walkTo({ x: -30, z: 12 }); await walkTo({ x: -60, z: 8 })
let facing = null; const t0 = Date.now()
while (Date.now() - t0 < 60000) {
  const s = JSON.parse(await ev(READ)); const f = facingOf(s)
  if (!f) { await sleep(300); continue }
  if (f.d > 9) { await walkTo(f.near, 8, 20000); continue }
  facing = { d: f.d, dot: f.dot }
  if (f.d < 4) { await setYaw(yawToward(s.player, f.near)); await sleep(300); await shot('pig-facing'); const f2 = facingOf(JSON.parse(await ev(READ))); if (f2) facing = { d: f2.d, dot: f2.dot }; break }
  await sleep(300)
}
console.log('pig-facing', JSON.stringify(facing), 'errors', JSON.stringify(errors.slice(0, 5)))
ws.close(); chrome.kill()
