import { spawn } from 'node:child_process'; import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const query = process.argv[2] ?? 'q=low'; const seconds = Number(process.argv[3] ?? 28)
const profile = join(tmpdir(), `web3d-prof-${Date.now()}`); await mkdir(profile, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) return; const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable'); await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 2000 }); await send('Profiler.start')
send('Page.navigate', { url: `http://localhost:5173/?${query}` }); await sleep(seconds * 1000)
const { profile: prof } = await send('Profiler.stop')
const byId = new Map(prof.nodes.map((n) => [n.id, n])); const self = new Map(); const dt = prof.timeDeltas; let total = 0
for (let i = 0; i < prof.samples.length; i++) { const n = byId.get(prof.samples[i]); const d = dt[i] ?? 0; total += d; const cf = n.callFrame; const key = `${cf.functionName || '(anon)'} @ ${(cf.url || '').split('/').slice(-2).join('/')}:${cf.lineNumber}`; self.set(key, (self.get(key) ?? 0) + d) }
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)
console.log('total_ms', Math.round(total / 1000)); for (const [k, v] of top) console.log(String(Math.round(v / 1000)).padStart(6), 'ms', k)
await writeFile('Docs/qa/anim-probe/entry-profile.json', JSON.stringify(prof)); ws.close(); chrome.kill()
