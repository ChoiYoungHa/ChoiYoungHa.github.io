// 타이틀 클릭 → 생성 화면 → 버튼 클릭 흐름 검증 (dev 5173)
import { spawn } from 'node:child_process'; import { mkdir, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = join(tmpdir(), `web3d-click-${Date.now()}`); await mkdir(profile, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) return; const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value }
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }) }
const state = () => ev(`(() => ({ title: !!document.querySelector('[aria-label="타이틀"]'), canStart: !document.querySelector('[aria-label="타이틀"] button')?.disabled, create: !!document.querySelector('[aria-label*="생성"], [aria-label*="캐릭터"]'), text: (document.querySelector('[data-game-overlay]')?.innerText ?? '').replace(/\s+/g,' ').slice(0,120), buttons: [...document.querySelectorAll('[data-game-overlay] button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0,12), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), d: b.disabled, pe: getComputedStyle(b).pointerEvents } }) }))()`)
await send('Page.navigate', { url: 'http://localhost:5173/?game=1&q=low' })
let s; for (let i = 0; i < 40; i++) { await sleep(1000); try { s = await state(); if (s.title && s.canStart) break } catch {} }
console.log('title ready', JSON.stringify(s).slice(0, 300))
console.log('elementAt', await ev(`(() => { const e = document.elementFromPoint(640, 200); const b = document.elementFromPoint(640, 333); return { bg: e && (e.tagName + '#' + (e.getAttribute('aria-label')||e.className||'') + ' pe=' + getComputedStyle(e).pointerEvents), btn: b && (b.tagName + ':' + b.textContent.trim().slice(0,10)) } })()`)); await ev(`(() => { globalThis.__ev = []; for (const t of ['pointerdown','mousedown','click']) window.addEventListener(t, (e) => globalThis.__ev.push(t + ':' + e.target.tagName + ':' + (e.defaultPrevented ? 'prevented' : 'ok')), true); return 1 })()`)
await click(640, 200); await sleep(300); console.log('events', await ev('JSON.stringify(globalThis.__ev)'))
await click(640, 200); await sleep(800); s = await state(); console.log('after 2nd bg click', JSON.stringify({ title: s.title })); console.log('events2', await ev('JSON.stringify(globalThis.__ev)'))
s = await state(); console.log('after bg click', JSON.stringify({ title: s.title, text: s.text.slice(0, 60), buttons: s.buttons.slice(0, 6) }))
// 생성 화면: 첫 버튼들 좌표로 클릭 시도(확인 버튼 = 마지막)
if (s.title) { await click(640, 333); await sleep(800); s = await state(); console.log('after button click', JSON.stringify({ title: s.title, text: s.text.slice(0, 60) })) }
{ const sh = await send('Page.captureScreenshot', { format: 'png' }); await (await import('node:fs/promises')).writeFile('Docs/qa/anim-probe/create-screen.png', Buffer.from(sh.data, 'base64')) }
if (!s.title && s.buttons.length) { const b = s.buttons.at(-1); await click(b.x, b.y); await sleep(800); const s2 = await state(); console.log('after confirm click', JSON.stringify({ text: s2.text.slice(0, 80), buttons: s2.buttons.slice(0, 4) })) }
ws.close(); chrome.kill()
