// 아바타 애니메이션 프로브: dev 서버(5173) ?game=1&net=0&scene=hunt 에서 본 회전·액션 상태를 샘플링한다.
import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile = join(tmpdir(), `web3d-animprobe-${Date.now()}`); await mkdir(profile, { recursive: true })
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 200)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)); return } const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
await send('Page.navigate', { url: 'http://localhost:5173/?game=1&net=0&scene=hunt&q=low' }); await sleep(12000)

const KEY = { ArrowUp: ['ArrowUp', 38] }; const key = (type, code) => send('Input.dispatchKeyEvent', { type, code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 })
for (let i = 1; i <= 20; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640 + i * 18, y: 360, button: 'left', buttons: 1 }); await sleep(16) }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1000, y: 360, button: 'left', clickCount: 1 }); await sleep(300)
await key('keyDown', 'ArrowUp'); await sleep(1300); { const sh = await send('Page.captureScreenshot', { format: 'png' }); await mkdir('Docs/qa/anim-probe', { recursive: true }); await writeFile('Docs/qa/anim-probe/turn-walk.png', Buffer.from(sh.data, 'base64')) } await key('keyUp', 'ArrowUp')
console.log('done'); ws.close(); chrome.kill()
