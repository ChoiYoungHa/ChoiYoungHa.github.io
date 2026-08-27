import { spawn } from 'node:child_process'; import { mkdir, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = join(tmpdir(), `web3d-animprobe2-${Date.now()}`); await mkdir(profile, { recursive: true })
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11', '--no-first-run', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank'], { stdio: 'ignore', windowsHide: true })
let port; for (let i = 0; i < 200 && !port; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) } catch { await sleep(100) } }
let target; for (let i = 0; i < 100 && !target; i++) { const t = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()); target = t.find((x) => x.type === 'page'); if (!target) await sleep(100) }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
let id = 0; const pending = new Map()
ws.addEventListener('message', (ev) => { const m = JSON.parse(String(ev.data)); if (m.method) return; const w = pending.get(m.id); pending.delete(m.id); m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result) })
const send = (method, params = {}) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })) })
await send('Page.enable'); await send('Runtime.enable')
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value }
await send('Page.navigate', { url: 'http://localhost:5173/?game=1&net=0&scene=hunt&q=low' }); await sleep(12000)
const out = await ev(`(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js'); const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
  const s = globalThis.__R3F_SCENE__; let root = null; s.traverse((o) => { if (!root && o.name === 'player' && !o.isMesh) root = o })
  const glb = root.children[0]
  const bones = []; glb.traverse((o) => { if (o.isBone) bones.push(o) }); const hips = bones.find((b) => b.name === 'Hips'); const leg = bones.find((b) => b.name === 'LeftUpLeg')
  const sk = []; glb.traverse((o) => { if (o.isSkinnedMesh) sk.push(o) }); const skin = sk[0]
  const sameHips = skin.skeleton.bones.includes(hips)
  const gltf = await new GLTFLoader().loadAsync('/models/char_player.glb')
  const clip = gltf.animations.find((c) => c.name === 'walk'); const tracks = clip.tracks.slice(0, 3).map((t) => t.name)
  const before = [leg.quaternion.x, leg.quaternion.y, leg.quaternion.z, leg.quaternion.w].map((v) => +v.toFixed(3))
  const mixer = new THREE.AnimationMixer(glb); const a = mixer.clipAction(clip); a.play(); mixer.update(0.9)
  const after = [leg.quaternion.x, leg.quaternion.y, leg.quaternion.z, leg.quaternion.w].map((v) => +v.toFixed(3))
  const unbound = mixer._bindings ? mixer._bindings.filter((b) => !b.binding.node).length : null
  return { sameHips, skeletonBones: skin.skeleton.bones.length, bonesUnderGlb: bones.length, tracks, before, after, unbound, glbName: glb.name, hipsParent: hips.parent?.name, armatureScale: glb.children[0]?.scale?.x, rootChildren: glb.children.map(c=>c.name+':'+c.type) }
})()`)
console.log(JSON.stringify(out)); ws.close(); chrome.kill()
