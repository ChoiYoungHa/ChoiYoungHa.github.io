// R77-A — WebGPU 캔버스 toDataURL 리드백이 검정(20,831B)이라 CDP Page.captureScreenshot(합성기 출력)으로 캡처한다.
// 사용: node cdp-shot.mjs --out-dir <dir> --tag <before|after> --shots S1,S2,S3 [--query "lookAssets=0"] [--settle 14000] [--port 5183]
import { execFile, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const ROOT = process.env.WEB3D_ROOT ?? 'C:/Users/USER/Desktop/claude/해커톤/web3d'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const VISTA = { S1: 'vista-mid', S2: 'vista-start', S3: 'vista-village' }
const execFileAsync = promisify(execFile)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const o = { outDir: null, tag: 'after', shots: ['S1', 'S2', 'S3'], query: '', settle: 14000, port: 5183 }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], n = () => argv[++i]
  if (a === '--out-dir') o.outDir = n(); else if (a === '--tag') o.tag = n(); else if (a === '--shots') o.shots = n().split(',')
  else if (a === '--query') o.query = n(); else if (a === '--settle') o.settle = Number(n()); else if (a === '--port') o.port = Number(n())
  else throw new Error('arg ' + a)
}
if (!o.outDir) throw new Error('--out-dir')
await mkdir(o.outDir, { recursive: true })

async function killChromeProfile(tag) {
  const command = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${tag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => {})
}

async function connectCdp(profile, child) {
  const portFile = join(profile, 'DevToolsActivePort')
  const deadline = Date.now() + 20000
  let port
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('chrome exited ' + child.exitCode)
    try { const [v] = (await readFile(portFile, 'utf8')).trim().split(/\r?\n/); port = Number(v); if (Number.isInteger(port)) break } catch {}
    await sleep(100)
  }
  if (!port) throw new Error('DevToolsActivePort timeout')
  let target
  while (Date.now() < deadline) {
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
    target = targets.find((t) => t.type === 'page'); if (target) break; await sleep(100)
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', () => rej(new Error('ws')), { once: true }) })
  let nextId = 0; const pending = new Map(); const events = []
  socket.addEventListener('message', (ev) => {
    const m = JSON.parse(String(ev.data))
    if (m.method) { events.push(m); return }
    const w = pending.get(m.id); if (!w) return; pending.delete(m.id)
    m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result)
  })
  const cdp = {
    events,
    send: (method, params = {}) => new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })) }),
    close: () => socket.close(),
  }
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable')
  return cdp
}

// 씬 그래프에서 4경로 적용 증거를 뽑는다(브라우저 안에서 실행).
const EVIDENCE_JS = `(() => {
  const scene = globalThis.__R3F_SCENE__; if (!scene) return { error: 'no __R3F_SCENE__' }
  const out = { heroTree: null, terrain: null, village: [], foliageGrassMap: null, texturedMeshes: 0, alphaTestMeshes: 0, meshes: 0, materials: new Set(), maps: new Set() }
  scene.traverse((obj) => {
    if (obj.name === 'hero-tree' && out.heroTree === null) out.heroTree = { type: obj.type, source: obj.userData?.source ?? 'procedural', materialCount: obj.userData?.materialCount ?? null }
    if (obj.name === 'terrain') out.terrain = obj.userData?.source ?? 'flat'
    if (/^village-house-[abc]$/.test(obj.name)) out.village.push({ name: obj.name, source: obj.userData?.source ?? 'procedural', type: obj.type })
    if (obj.name === 'foliage-grass') { const m = obj.material; out.foliageGrassMap = !!(m && m.map); out.foliageGrassAlphaTest = m ? m.alphaTest : null }
    if (obj.isMesh) {
      out.meshes++
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) { if (!m) continue; out.materials.add(m.uuid); if (m.map) { out.texturedMeshes++; out.maps.add(m.map.uuid) } if (m.alphaTest > 0) out.alphaTestMeshes++ }
    }
  })
  out.materialCount = out.materials.size; out.mapCount = out.maps.size; delete out.materials; delete out.maps
  out.hud = document.querySelector('[data-testid="runtime-hud"]')?.textContent ?? null
  const cv = document.querySelector('.stage canvas'); const st = document.querySelector('.stage'); out.canvas = cv ? { w: cv.width, h: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight } : null; out.stage = st ? st.getBoundingClientRect().toJSON() : null; out.dpr = devicePixelRatio; out.inner = [innerWidth, innerHeight]
  return out
})()`

for (const s of o.shots) {
  const name = `m5-${o.tag}-${s}`
  const server = spawn(process.execPath, [join(ROOT, 'Automation/probe-server.mjs'), String(o.port), '1', '90000'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let log = ''; server.stdout.on('data', (c) => { log += c }); server.stderr.on('data', (c) => { log += c })
  const t0 = Date.now(); while (!log.includes('LISTENING') && Date.now() - t0 < 10000) await sleep(100)
  const tag = `web3d-cdp-${process.pid}-${Date.now()}`; const profile = join(tmpdir(), tag); await mkdir(profile, { recursive: true })
  const params = new URLSearchParams({ q: 'low', shot: VISTA[s], report: name }); if (o.query) for (const [k, v] of new URLSearchParams(o.query)) params.set(k, v)
  const url = `http://127.0.0.1:${o.port}/?${params}`
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { cwd: ROOT, stdio: 'ignore', windowsHide: true })
  const cdp = await connectCdp(profile, chrome)
  await cdp.send('Page.navigate', { url })
  const t1 = Date.now(); while (!log.includes(`RESULT ${name} `) && Date.now() - t1 < 60000) await sleep(200)
  await sleep(o.settle)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const evidence = await cdp.send('Runtime.evaluate', { expression: EVIDENCE_JS, returnByValue: true }).then((r) => r.result?.value)
  const console_ = cdp.events.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => ({ type: e.params.type, text: e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) }))
  const exceptions = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? e.params.exceptionDetails?.text)
  const logEntries = cdp.events.filter((e) => e.method === 'Log.entryAdded').map((e) => ({ level: e.params.entry.level, text: e.params.entry.text.slice(0, 300) }))
  cdp.close(); chrome.kill(); await killChromeProfile(tag); server.kill(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {})
  const png = Buffer.from(shot.data, 'base64')
  await writeFile(join(o.outDir, `${name}.png`), png)
  const resultJson = join(ROOT, 'Docs/m0a', `${name}.json`)
  let result = null; try { result = JSON.parse(await readFile(resultJson, 'utf8')) } catch {}
  await rm(resultJson, { force: true }).catch(() => {}); await rm(join(ROOT, 'Docs/m0a', `${name}.png`), { force: true }).catch(() => {})
  const summary = { name, url, at: new Date().toISOString(), pngBytes: png.length, gotResult: log.includes(`RESULT ${name} `), settleMs: Date.now() - t1, evidence, console: console_, exceptions, logEntries, hud: result?.hud ?? null, errors: result?.errors ?? null, backend: result?.backend ?? null, fps: result?.fps ?? null, calls: result?.calls ?? null }
  await writeFile(join(o.outDir, `${name}.json`), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ name, pngBytes: png.length, backend: summary.backend, fps: summary.fps, calls: summary.calls, evidence: { hero: evidence?.heroTree?.source, terrain: evidence?.terrain, village: evidence?.village?.map((v) => v.source), grassMap: evidence?.foliageGrassMap, textured: evidence?.texturedMeshes, alphaTest: evidence?.alphaTestMeshes, materials: evidence?.materialCount, maps: evidence?.mapCount }, consoleErrors: console_.filter((c) => c.type === 'error').length, exceptions: exceptions.length, logErrors: logEntries.filter((l) => l.level === 'error').length }))
}
