// 2026-08-28 보스 프로브(dev 5173): ?boss=1 로 즉시 각성 → 공원 서쪽 둥지로 이동 → 보스 HP 바·모델·공격 연출 캡처 → 공격 몇 번으로 HP 감소 확인.
// 사용: node Automation/boss-probe.mjs [outDir] [tag] [baseUrl]
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/boss'; const TAG = process.argv[3] ?? 'r1'; const BASE = process.argv[4] ?? 'http://localhost:5173/'
const profile = join(tmpdir(), `web3d-boss-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
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
const KEY = { KeyW: ['w', 87], KeyA: ['a', 65], KeyD: ['d', 68], Digit1: ['1', 49], Digit2: ['2', 50], Enter: ['Enter', 13] }
const keyDown = (code) => send('Input.dispatchKeyEvent', { type: KEY[code][0].length === 1 ? 'keyDown' : 'rawKeyDown', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const keyUp = (code) => send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const tap = async (code) => { await keyDown(code); await sleep(60); await keyUp(code) }
const waitFor = async (expr, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(300) } return false }
let yaw = 0
const setYaw = async (t) => { let d = t - yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const dx = -d / 0.005; await ev(`(() => { window.dispatchEvent(new PointerEvent('pointerdown', { clientX: 640, clientY: 360 })); window.dispatchEvent(new PointerEvent('pointermove', { clientX: 640 + (${dx}), clientY: 360 })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 640 + (${dx}), clientY: 360 })); return true })()`); yaw = t }
const yawToward = (a, b) => Math.atan2(-(b.x - a.x), -(b.z - a.z)); const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, boss: null, bossBar: document.querySelector('[aria-label^="보스 체력"]')?.getAttribute('aria-label') ?? null, hp: document.querySelector('[aria-label="캐릭터 상태"]')?.textContent?.slice(0, 40) ?? null, dead: !!document.querySelector('[aria-label*="사망"], [aria-label*="부활"]'), banner: document.querySelector('[aria-label="보스 배너"]')?.textContent ?? null, text: (document.querySelector('[data-game-overlay]')?.textContent ?? '').replace(/s+/g, ' ').slice(0, 160) }; if (!s) return JSON.stringify(out); s.traverse((o) => { if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: o.position.x, z: o.position.z }; if (o.name === 'boss-the-eleventh') out.boss = { visible: o.visible, x: +o.position.x.toFixed(1), z: +o.position.z.toFixed(1), rotY: +o.rotation.y.toFixed(2) } }); return JSON.stringify(out) })()`
const walkTo = async (t, tol = 1.5, timeoutMs = 60000) => { const t0 = Date.now(); let last = null; let stuck = Date.now(); let n = 0; await keyDown('KeyW'); try { while (Date.now() - t0 < timeoutMs) { const s = JSON.parse(await ev(READ)); const p = s.player; if (!p) { await sleep(200); continue } if (dist(p, t) <= tol) return; await setYaw(yawToward(p, t)); if (last && dist(last, p) > 0.05) stuck = Date.now(); if (Date.now() - stuck > 2500) { n += 1; stuck = Date.now(); const k = n % 2 ? 'KeyD' : 'KeyA'; await keyDown(k); await sleep(900); await keyUp(k) } last = p; await sleep(120) } } finally { await keyUp('KeyW') } }

await send('Page.navigate', { url: `${BASE}?game=1&net=0&scene=hunt&boss=1&q=base` })
await waitFor(`!!document.querySelector('[aria-label="게임 HUD"]') && !!globalThis.__R3F_SCENE__`, 60000); await sleep(3000)
console.log('start', await ev(READ))
await walkTo({ x: -30, z: 12 }); await walkTo({ x: -60, z: 8 }); await walkTo({ x: -86, z: 9 }, 2, 60000)
let s = JSON.parse(await ev(READ)); console.log('near', JSON.stringify(s))
await setYaw(yawToward(s.player, { x: -104, z: 8 })); await sleep(600); await shot('boss-approach')
// 보스가 다가오면 공격 연타(1번·2번) — HP 감소·공격 연출 캡처
const t0 = Date.now(); let shots = 0; let minHp = null
while (Date.now() - t0 < 60000) {
  s = JSON.parse(await ev(READ))
  if (/클릭하여 계속/.test(s.text ?? '')) { await tap('Enter'); await sleep(300); continue }
  if (s.boss && s.boss.visible && dist(s.player, s.boss) < 6) { await setYaw(yawToward(s.player, s.boss)); await tap('Digit1'); await sleep(200); if (shots < 3) { await shot(`boss-fight-${shots}`); shots += 1 } await tap('Digit2'); await sleep(500) }
  else await sleep(300)
  if ((Date.now() - t0) % 5000 < 350) console.log('tick', JSON.stringify(s))
  const m = s.bossBar?.match(/(\d+)%/); if (m) minHp = Math.min(minHp ?? 100, Number(m[1]))
  if (minHp !== null && minHp <= 70) break
}
console.log('end', await ev(READ), 'minHp%', minHp, 'errors', JSON.stringify(errors.slice(0, 5)))
ws.close(); chrome.kill()
