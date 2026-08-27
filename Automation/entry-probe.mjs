// 진입 프로브: 로딩 % 와 메인스레드 정지(rAF 간격) 타임라인. 사용: node Automation/entry-probe.mjs "<query>"
import { spawn } from 'node:child_process'; import { mkdir, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const query = process.argv[2] ?? 'game=1'
const profile = join(tmpdir(), `web3d-entry-${Date.now()}`); await mkdir(profile, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map(); const errors = []
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) { if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 160)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160)); return } const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, timeout: 20000 }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
await send('Page.addScriptToEvaluateOnNewDocument', { source: `globalThis.__gaps=[]; (function(){ let last=performance.now(); function f(){ const n=performance.now(); if(n-last>120) globalThis.__gaps.push([Math.round(n), Math.round(n-last)]); last=n; requestAnimationFrame(f) } requestAnimationFrame(f) })()` })
const t0 = Date.now(); console.log('navigate'); send('Page.navigate', { url: `http://localhost:5173/?${query}` })
const rows = []
for (let i = 0; i < 40; i++) {
  await sleep(1000)
  const s = Date.now(); let v
  try { v = await ev(`(() => { const el = document.querySelector('[aria-label="타이틀"]'); const t = (el ? el.innerText : document.body.innerText); const idx = t.indexOf('%'); let pct = null; if (idx > 0) { const m = t.slice(Math.max(0, idx - 4), idx).replace(/[^0-9]/g, ''); pct = m ? +m : null } const b = document.body.innerText; const pi = b.indexOf('preset:'); return { pct, title: !!el, preset: pi >= 0 ? b.slice(pi + 7, pi + 14).trim() : null, gaps: globalThis.__gaps.splice(0), bodyLen: b.length } })()`) } catch (e) { v = { evalError: e.message.slice(0, 80) } }
  const evalMs = Date.now() - s
  rows.push({ t: Math.round((Date.now() - t0) / 1000), evalMs, ...v })
  console.log(JSON.stringify(rows.at(-1)))
  if (v.pct === 100 && !v.title) break
}
console.log('errors', JSON.stringify(errors.slice(0, 4))); ws.close(); chrome.kill()
