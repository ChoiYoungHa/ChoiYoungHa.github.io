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
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 }); await sleep(300)
const PROBE = `(() => { const s = globalThis.__R3F_SCENE__; const out = { player: null, skinned: 0, bones: {}, boneNames: [] }
  if (!s) return { noScene: true }
  let root = null; s.traverse((o) => { if (!root && o.name === 'player' && !o.isMesh) root = o }); if (!root) return { noPlayer: true }
  out.player = { x: root.position.x, z: root.position.z, children: root.children.length, childNames: root.children.map((c) => c.name + ':' + c.type) }
  root.traverse((o) => {
    if (o.isSkinnedMesh) { out.skinned++; out.skeletonBones = o.skeleton?.bones?.length; out.bindMatrixOk = !!o.bindMatrix }
    if (o.isBone && ['LeftUpLeg','LeftArm','Hips','Spine'].includes(o.name)) { out.bones[o.name] = [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map((v) => +v.toFixed(3)); if (o.name === 'Hips') out.hipsPos = [o.position.x, o.position.y, o.position.z].map((v) => +v.toFixed(3)) }
    if (o.isBone) out.boneNames.push(o.name) })
  out.boneNames = out.boneNames.slice(0, 6); return out })()`
const KEY = { ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], ArrowLeft: ['ArrowLeft', 37], Digit1: ['1', 49], Digit2: ['2', 50], ShiftLeft: ['Shift', 16] }
const key = (type, code) => send('Input.dispatchKeyEvent', { type, code, key: KEY[code][0], windowsVirtualKeyCode: KEY[code][1], nativeVirtualKeyCode: KEY[code][1] })
const samples = { idle: [], walk: [], attack: [] }
const shotI = await send('Page.captureScreenshot', { format: 'png' }); await mkdir('Docs/qa/anim-probe', { recursive: true }); await writeFile('Docs/qa/anim-probe/idle.png', Buffer.from(shotI.data, 'base64'))
console.log('sword', await ev(`(() => { const s = globalThis.__R3F_SCENE__; let h = null, p = null, cam = null; s.traverse((o) => { if (o.name === 'weapon-holder') h = o; if (o.name === 'player' && !o.isMesh) p = o }); if (!h) return { noHolder: true }; const v = new (p.position.constructor)(); h.getWorldPosition(v); const pv = new (p.position.constructor)(); p.getWorldPosition(pv); return { holderWorld: [v.x, v.y, v.z].map((n) => +n.toFixed(2)), playerWorld: [pv.x, pv.y, pv.z].map((n) => +n.toFixed(2)), holderScale: +h.scale.x.toFixed(4), handWorldScale: h.parent.getWorldScale(new (p.position.constructor)()).x, glbScale: p.children[0].scale.x, armScale: p.children[0].children[0]?.scale?.x, swordWorldScale: h.getWorldScale(new (p.position.constructor)()).x, q: [h.quaternion.x, h.quaternion.y, h.quaternion.z, h.quaternion.w].map((n) => +n.toFixed(3)), children: h.children.length } })()`))
for (let i = 0; i < 3; i++) { samples.idle.push(await ev(PROBE)); await sleep(400) }
await key('keyDown', 'ArrowUp'); await sleep(1400); const shotWalk = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/walk-hold.png', Buffer.from(shotWalk.data, 'base64')); await key('keyUp', 'ArrowUp'); await sleep(200)
await key('keyDown', 'ArrowDown'); await sleep(1400); { const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/walk-back.png', Buffer.from(sh.data, 'base64')) } await key('keyUp', 'ArrowDown'); await sleep(600)
{ const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/idle-after-back.png', Buffer.from(sh.data, 'base64')) }
await key('keyDown', 'ArrowUp'); await sleep(1400); { const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/walk-again.png', Buffer.from(sh.data, 'base64')) } await key('keyUp', 'ArrowUp'); await sleep(300)
for (let i = 0; i < 4; i++) { samples.walk.push(await ev(PROBE)); await sleep(300) }
const shotW = await send('Page.captureScreenshot', { format: 'png' }); await sleep(300)
await key('keyDown', 'Digit1'); await sleep(60); await key('keyUp', 'Digit1'); await sleep(450)
await key('keyDown', 'Digit2'); await sleep(60); await key('keyUp', 'Digit2'); await sleep(160)
{ const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/skill-160ms.png', Buffer.from(sh.data, 'base64')) }
console.log('fxmats', await ev(`(() => { const s = globalThis.__R3F_SCENE__; const out = []; s.traverse((o) => { if (o.isInstancedMesh && o.parent?.name === 'm6-game-runtime' && o.count > 0 && o.geometry?.type === 'PlaneGeometry') { for (let i = 0; i < Math.min(o.count, 4); i++) { const e = o.instanceMatrix.array; const k = i * 16; out.push({ pos: [e[k+12], e[k+13], e[k+14]].map(v => +v.toFixed(2)), scale: [Math.hypot(e[k], e[k+1], e[k+2]), Math.hypot(e[k+4], e[k+5], e[k+6])].map(v => +v.toFixed(2)) }) } out.push({ mesh: o.name, count: o.count, frustumCulled: o.frustumCulled }) } }); return JSON.stringify(out).slice(0, 600) })()`))
await sleep(250); { const sh = await send('Page.captureScreenshot', { format: 'png' }); await writeFile('Docs/qa/anim-probe/skill-400ms.png', Buffer.from(sh.data, 'base64')) }
for (let i = 0; i < 3; i++) { samples.attack.push(await ev(PROBE)); await sleep(250) }
const shotA = await send('Page.captureScreenshot', { format: 'png' })
await mkdir('Docs/qa/anim-probe', { recursive: true }); await writeFile('Docs/qa/anim-probe/walk.png', Buffer.from(shotW.data, 'base64')); await writeFile('Docs/qa/anim-probe/attack.png', Buffer.from(shotA.data, 'base64'))
await writeFile('Docs/qa/anim-probe/samples.json', JSON.stringify({ samples, errors }, null, 1))
const brief = (arr) => arr.map((s) => JSON.stringify({ leg: s.bones?.LeftUpLeg, arm: s.bones?.LeftArm, hips: s.hipsPos, x: s.player?.x?.toFixed?.(2) }))
console.log('meta', JSON.stringify({ skinned: samples.idle[0].skinned, skeletonBones: samples.idle[0].skeletonBones, boneNames: samples.idle[0].boneNames, player: samples.idle[0].player, noPlayer: samples.idle[0].noPlayer, noScene: samples.idle[0].noScene, errors: errors.slice(0, 3) }))
console.log('IDLE'); console.log(brief(samples.idle).join('\n')); console.log('WALK'); console.log(brief(samples.walk).join('\n')); console.log('ATTACK'); console.log(brief(samples.attack).join('\n'))
ws.close(); chrome.kill()
