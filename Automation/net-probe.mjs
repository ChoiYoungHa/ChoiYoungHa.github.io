// 2026-08-28 멀티플레이 프로브: 헤드리스 Chrome 2개를 같은 방(?room=)에 넣고 서로의 원격 아바타·접속 배지를 확인한다.
// 사용: node Automation/net-probe.mjs [outDir] [tag] [baseUrl]
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/net'; const TAG = process.argv[3] ?? 'r1'; const BASE = process.argv[4] ?? 'http://localhost:5173/'
const ROOM = `probe${Date.now().toString(36).slice(-6)}`
await mkdir(OUT, { recursive: true })

async function launch(label) {
  const profile = join(tmpdir(), `web3d-net-${label}-${Date.now()}`); await mkdir(profile, { recursive: true })
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
  const key = async (code, vk, ms) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await sleep(ms); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }) }
  return { label, chrome, ws, send, ev, shot, key, errors }
}

const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { badge: document.querySelector('[aria-label="접속 상태"]')?.textContent ?? null, status: document.querySelector('[data-net-status]')?.getAttribute('data-net-status') ?? null, remotes: [], player: null }; if (!s) return JSON.stringify(out); s.traverse((o) => { if (/^remote-player-/.test(o.name)) out.remotes.push({ id: o.name.slice(14, 22), visible: o.visible, x: +o.position.x.toFixed(1), z: +o.position.z.toFixed(1), plate: !!o.getObjectByName('nameplate'), weapon: !!o.children.find((c) => /^remote-weapon-/.test(c.name) || c.getObjectByName?.('weapon-holder')) }); if (o.name === 'player' && !o.isMesh && !out.player) out.player = { x: +o.position.x.toFixed(1), z: +o.position.z.toFixed(1) } }); return JSON.stringify(out) })()`

const [a, b] = await Promise.all([launch('A'), launch('B')])
const url = (n) => `${BASE}?game=1&scene=hunt&q=low&room=${ROOM}&name=${n}`
await a.send('Page.navigate', { url: url('alpha') }); await sleep(5000)
await b.send('Page.navigate', { url: url('bravo') }); await sleep(14000)
console.log('A0', await a.ev(READ)); console.log('B0', await b.ev(READ))
// B 가 앞으로 걸으면 A 에서 B 의 원격 아바타가 움직여야 한다
await b.key('KeyW', 87, 2500); await sleep(800)
const A1 = JSON.parse(await a.ev(READ)); const B1 = JSON.parse(await b.ev(READ))
console.log('A1', JSON.stringify(A1)); console.log('B1', JSON.stringify(B1))
await a.shot('net-A-sees-B'); await b.shot('net-B-sees-A')
// B 종료 → A 의 원격 목록에서 사라져야 한다
b.ws.close(); b.chrome.kill(); await sleep(8000)
const A2 = JSON.parse(await a.ev(READ)); console.log('A2', JSON.stringify(A2))
const ok = A1.remotes.length === 1 && B1.remotes.length === 1 && A1.remotes[0].visible && Math.abs(A1.remotes[0].x - B1.player.x) < 1.5 && Math.abs(A1.remotes[0].z - B1.player.z) < 1.5 && A2.remotes.length === 0
console.log(ok ? 'NET PASS' : 'NET FAIL', 'errorsA', JSON.stringify(a.errors.slice(0, 5)), 'errorsB', JSON.stringify(b.errors.slice(0, 5)))
a.ws.close(); a.chrome.kill()
process.exit(ok ? 0 : 1)
