// 2026-08-28 코덱스 자산 적용 확인 프로브: dev 5173 ?game=1&scene=hunt 에서 무기 모델명·코덱스 식생 인스턴스 수·드롭 메시를 읽고 캡처한다.
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = process.argv[2] ?? 'Docs/qa/codex-assets'; const TAG = process.argv[3] ?? 'r1'; const SCENE = process.argv[4] ?? 'hunt'
const profile = join(tmpdir(), `web3d-codexprobe-${Date.now()}`); await mkdir(profile, { recursive: true }); await mkdir(OUT, { recursive: true })
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1600,900', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 300)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)); return } const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
const shot = async (name) => { const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(OUT, `${name}-${TAG}.png`), Buffer.from(sh.data, 'base64')) }
const key = async (code, vk, ms) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); await sleep(ms); await send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code.replace('Key', '').toLowerCase(), windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }) }
await send('Page.navigate', { url: `http://localhost:5173/?game=1&scene=${SCENE}&q=base` }); await sleep(16000)
const READ = `(() => { const s = globalThis.__R3F_SCENE__; const out = { weapon: null, codex: {}, drops: {}, player: null }; if (!s) return 'no scene'; s.traverse((o) => { if (/^weapon-/.test(o.name)) out.weapon = o.name; if (/^codex-foliage-/.test(o.name)) out.codex[o.name.slice(14)] = { cap: o.instanceMatrix.count, shown: o.count, groups: o.geometry.groups.length, mats: Array.isArray(o.material) ? o.material.length : 1 }; if (/^drops-/.test(o.name)) out.drops[o.name] = o.count; if (o.name === 'player' && !o.isMesh) out.player = [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(1)) }); return JSON.stringify(out) })()`
console.log('state', await ev(READ))
await shot('s1-spawn')
await key('KeyW', 87, 2500); await sleep(600); await shot('s2-walk')
await key('KeyA', 65, 1200); await sleep(600); await shot('s3-turn')
console.log('state2', await ev(READ))
console.log('errors', JSON.stringify(errors.slice(0, 8)))
ws.close(); chrome.kill()
