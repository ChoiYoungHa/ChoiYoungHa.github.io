#!/usr/bin/env node
// R55-A — 룩 옵션 일괄 검증 러너. GATE 후 GPU 세션이 **한 줄**로 대기 중인 룩 변형을 캡처·측정·판정한다.
//
// 사용: node Automation/lookdev-variants.mjs --variants default --out-dir Docs/lookdev/variants [--dry-run] [--skip-build]
//       --variants <preset|json 경로>  : 기본 프리셋 'default' = baseline + hazeDir + heroContrast + vistaPitch
//       --out-dir <dir>                : 캡처 png/json·measure·l4·결과표(variants-result.md/json) 저장처
//       --dry-run                      : 빌드·서버·크롬 없이 실행 계획(명령·URL·산출 경로)만 출력 (GPU 금지 세션용)
//       --skip-build                   : dist 를 그대로 사용(없으면 에러)
//       --shots S1,S2,S3               : 캡처할 vista 를 제한(기본 전부)
//       --port 5183 · --settle-ms 12000 · --timeout-ms 60000
//
// 구조(기존 도구 재사용):
//   빌드 1회(npm run build) → 캡처마다 probe-server.mjs(dist 서빙·/shot·/result 수신, Docs/m0a/<name>.{png,json})
//   + 헤드리스 Chrome(run-bench.mjs 의 기동 인자 그대로, export 되지 않아 최소 복제) → RESULT 로그로 종료 판정
//   → png 를 out-dir 로 이동 → measure.mjs(measure) L1~L3·L5 → 필요 시 l4-contrast.mjs(l4Contrast) L4 Δ·수목 bbox
//   → judge()(순수) 로 ADOPT 후보 / REJECT / UNSUPPORTED.
//
// HDR 로드 대기 규칙(R22·R30 교훈): ?shot= 은 12초 고정 지연이라 HDR 이 늦으면 하늘이 흰 채 찍힌다.
//   → 캡처 후 상단 밴드(0·1) 휘도 > 235 이거나 png < 5KB 이면 실패로 보고 1회 재캡처. 짝(nohero) 캡처는
//     상단 밴드 휘도가 본 캡처와 15 이상 다르면 재캡처(차분이 하늘 전체로 번지는 것을 막는다).
//
// 판정 규칙(judge):
//   변형의 자동 PASS 합계(3장 × L1·L2·L3·L5 = 12)가 baseline 보다 작으면 REJECT.
//   그 위에서 변형별 목표(targets)를 전부 만족하면 'ADOPT 후보', 아니면 REJECT + 수치.
//   쿼리 스위치가 src 에 없으면(예: hazeDir 는 wt/loading) UNSUPPORTED — 캡처하지 않는다.

import { spawn, execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { access, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { crc32, deflateSync } from 'node:zlib'
import { decodePng, luma709, measure } from './measure.mjs'
import { decodePng as decodeAnyPng, l4Contrast } from './l4-contrast.mjs'

const execFileAsync = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

// ───────────────────────── 변형 프리셋 ─────────────────────────

export const SHOTS = {
  S1: { vista: 'vista-mid', label: 'S1 vista-mid (L1·L2·L3)' },
  S2: { vista: 'vista-start', label: 'S2 vista-start (L5·L4 실루엣)' },
  S3: { vista: 'vista-village', label: 'S3 vista-village (하늘 166 문제)' },
}

/** L4 bbox — Docs/qa/m3-l4-contrast.json 과 같은 좌표(S2 수목). */
export const L4_BBOX = { left: 553, top: 89, right: 739, bottom: 302 }

export const DEFAULT_VARIANTS = [
  {
    name: 'baseline',
    label: '옵션 전부 off (현재 채택값)',
    query: '',
    switches: [],
    shots: ['S1', 'S2', 'S3'],
    noHero: ['S2'],
    targets: [],
  },
  {
    name: 'hazeDir',
    label: '?hazeDir=1 — 하늘 방위 가중(worker-codex, wt/loading). 목표 S3 원경 ≤145',
    query: 'hazeDir=1',
    switches: ['hazeDir'],
    shots: ['S1', 'S2', 'S3'],
    noHero: [],
    targets: [{ metric: 's3.far.luma', op: '<=', value: 145 }],
  },
  {
    name: 'heroContrast',
    label: '?heroContrast=1&heroTrunk=0.75&heroCanopy=1.1 — L4 줄기/수관 Δ≥10 (R54-A K1)',
    query: 'heroContrast=1&heroTrunk=0.75&heroCanopy=1.1',
    switches: ['heroContrast'],
    shots: ['S1', 'S2', 'S3'],
    noHero: ['S2'],
    targets: [
      { metric: 'l4.trunkCanopyDelta', op: '>=', value: 10 },
      { metric: 'l4.minDelta', op: '>=', value: 10 },
    ],
  },
  {
    name: 'vistaPitch',
    label: '?vistaPitch=22.1 — vista-mid 카메라 pitch 후보 B(R52-A). 목표 수관이 프레임 안(hideHero 차분 bbox 상단 y>0)',
    query: 'vistaPitch=22.1',
    switches: ['vistaPitch'],
    shots: ['S1'],
    noHero: ['S1'],
    targets: [{ metric: 's1.treeBboxTop', op: '>', value: 0 }],
    // S2·S3 는 이 변형과 무관 → baseline 값을 그대로 합산한다(reuseBaselineFor).
    reuseBaselineFor: ['S2', 'S3'],
  },
]

export function loadVariants(spec) {
  if (!spec || spec === 'default') return structuredClone(DEFAULT_VARIANTS)
  const list = JSON.parse(readFileSync(resolve(spec), 'utf8'))
  return validateVariants(list)
}

export function validateVariants(list) {
  if (!Array.isArray(list) || list.length === 0) throw new Error('variants: non-empty array required')
  const names = new Set()
  for (const v of list) {
    if (typeof v.name !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v.name)) throw new Error(`variants: bad name ${JSON.stringify(v.name)}`)
    if (names.has(v.name)) throw new Error(`variants: duplicate name ${v.name}`)
    names.add(v.name)
    if (typeof v.query !== 'string') throw new Error(`variants[${v.name}]: query must be a string`)
    if (!Array.isArray(v.shots) || v.shots.length === 0 || v.shots.some((s) => !SHOTS[s])) throw new Error(`variants[${v.name}]: shots must be subset of ${Object.keys(SHOTS)}`)
    v.noHero ??= []
    if (v.noHero.some((s) => !v.shots.includes(s))) throw new Error(`variants[${v.name}]: noHero must be within shots`)
    v.switches ??= []
    v.targets ??= []
    for (const t of v.targets) {
      if (!['<=', '>=', '<', '>'].includes(t.op) || typeof t.metric !== 'string' || !Number.isFinite(t.value)) throw new Error(`variants[${v.name}]: bad target ${JSON.stringify(t)}`)
    }
    v.reuseBaselineFor ??= []
  }
  if (!names.has('baseline')) throw new Error("variants: 'baseline' 이 있어야 판정 기준이 된다")
  return list
}

// ───────────────────────── 인자 ─────────────────────────

export function parseArgs(argv) {
  const o = { variants: 'default', outDir: 'Docs/lookdev/variants', dryRun: false, skipBuild: false, shots: null, port: 5183, settleMs: 12000, timeoutMs: 60000, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} requires a value`)
      return argv[++i]
    }
    if (a === '--variants') o.variants = next()
    else if (a === '--out-dir') o.outDir = next()
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--skip-build') o.skipBuild = true
    else if (a === '--shots') o.shots = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--port') o.port = Number(next())
    else if (a === '--settle-ms') o.settleMs = Number(next())
    else if (a === '--timeout-ms') o.timeoutMs = Number(next())
    else if (a === '--help' || a === '-h') o.help = true
    else throw new Error(`unknown argument ${a}`)
  }
  if (o.shots && o.shots.some((s) => !SHOTS[s])) throw new Error(`--shots must be subset of ${Object.keys(SHOTS)}`)
  if (!Number.isInteger(o.port) || o.port <= 0) throw new Error('--port must be a positive integer')
  for (const k of ['settleMs', 'timeoutMs']) if (!Number.isFinite(o[k]) || o[k] <= 0) throw new Error(`--${k} must be > 0`)
  return o
}

// ───────────────────────── 계획(캡처 목록) ─────────────────────────

/** 변형 × shot × (color|nohero) → 캡처 항목. 순수. */
export function planCaptures(variants, { shots = null, port = 5183 } = {}) {
  const items = []
  for (const v of variants) {
    for (const s of v.shots) {
      if (shots && !shots.includes(s)) continue
      for (const kind of ['color', ...(v.noHero.includes(s) ? ['nohero'] : [])]) {
        const name = `lv-${v.name}-${s}${kind === 'nohero' ? '-nohero' : ''}`
        const params = new URLSearchParams({ q: 'low', shot: SHOTS[s].vista, report: name })
        if (kind === 'nohero') params.set('hideHero', '1')
        for (const [k, val] of new URLSearchParams(v.query)) params.set(k, val)
        items.push({ variant: v.name, shot: s, kind, name, url: `http://127.0.0.1:${port}/?${params}` })
      }
    }
  }
  return items
}

/** 쿼리 스위치가 src 에 구현돼 있는지 — 없으면 캡처해도 baseline 과 같은 그림이 나온다. */
export function detectSwitches(names, srcText) {
  return Object.fromEntries(names.map((n) => [n, srcText.includes(`'${n}'`) || srcText.includes(`"${n}"`) || srcText.includes(`get('${n}')`)]))
}

// ───────────────────────── 판정(순수) ─────────────────────────

export function autoPassCount(measured) {
  // measure.mjs summary.passCount (L1·L2·L3·L5 자동 4개) 의 합
  return Object.values(measured).reduce((n, m) => n + (m?.summary?.passCount ?? 0), 0)
}

const OPS = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '>': (a, b) => a > b }

export function readMetric(metrics, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), metrics)
}

/**
 * @param baseline {passCount, metrics}   @param variant {name, supported, passCount, metrics, targets}
 * @returns {verdict:'ADOPT 후보'|'REJECT'|'UNSUPPORTED', reasons:[]}
 */
export function judge(baseline, variant) {
  if (variant.supported === false) return { verdict: 'UNSUPPORTED', reasons: [`쿼리 스위치 미구현: ${variant.missing?.join(',') ?? '?'}`] }
  const reasons = []
  if (variant.passCount < baseline.passCount) reasons.push(`자동 PASS 합계 ${variant.passCount} < baseline ${baseline.passCount}`)
  for (const t of variant.targets ?? []) {
    const v = readMetric(variant.metrics, t.metric)
    if (!Number.isFinite(v)) reasons.push(`${t.metric} 측정 없음`)
    else if (!OPS[t.op](v, t.value)) reasons.push(`${t.metric} ${v} !${t.op} ${t.value}`)
  }
  return { verdict: reasons.length === 0 ? 'ADOPT 후보' : 'REJECT', reasons }
}

/** 캡처가 HDR 로드 전(흰 하늘)인지. 상단 2밴드 휘도 > 235 이면 실패. */
export function looksUnloaded(measured) {
  const top = measured.bands.slice(0, 2)
  return top.every((b) => b.luma > 235)
}

// ───────────────────────── PNG 흑백 변환 (l4-contrast 입력) ─────────────────────────

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}

export function toGrayPng(img) {
  const { width, height, channels, data } = img
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * channels
      raw[y * (width + 1) + 1 + x] = Math.round(luma709(data[o], data[o + 1], data[o + 2]))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0 // 8bit gray
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

// ───────────────────────── 측정 → metrics ─────────────────────────

/** 변형 하나의 캡처 파일들로 measure/l4 를 돌려 metrics 를 만든다. files: { S1:{color,nohero?}, … } */
export function computeMetrics(files, { targetsPath, baselineMeasured = null, reuseBaselineFor = [] } = {}) {
  const targets = JSON.parse(readFileSync(targetsPath, 'utf8'))
  const measured = {}
  const metrics = {}
  for (const s of Object.keys(SHOTS)) {
    if (reuseBaselineFor.includes(s) && baselineMeasured?.[s]) {
      measured[s] = baselineMeasured[s]
    } else if (files[s]?.color) {
      const buf = readFileSync(files[s].color)
      measured[s] = measure(buf, { file: files[s].color, targets, targetsPath })
    }
    if (measured[s]) {
      metrics[s.toLowerCase()] = { far: measured[s].regions?.far, near: measured[s].regions?.near, pass: measured[s].summary?.passCount, L5: measured[s].global?.saturationMedianPct }
    }
    if (files[s]?.color && files[s]?.nohero) {
      const color = decodePng(readFileSync(files[s].color))
      const nohero = decodePng(readFileSync(files[s].nohero))
      const bwPath = files[s].color.replace(/\.png$/, '-bw.png')
      if (!existsSync(bwPath)) writeFileSync(bwPath, toGrayPng(color))
      // gray PNG 는 measure.decodePng 이 거부하므로 l4-contrast 의 디코더(gray 지원)로 읽는다.
      const bw = decodeAnyPng(readFileSync(bwPath))
      const res = l4Contrast({ color, nohero, bw, threshold: 24, delta: 10, bbox: s === 'S2' ? L4_BBOX : null })
      metrics[s.toLowerCase()].treeBboxTop = res.diff.fullMaskBbox.top
      metrics[s.toLowerCase()].treeBbox = res.diff.fullMaskBbox
      metrics[s.toLowerCase()].maskPixels = res.diff.maskPixels
      if (s === 'S2') {
        metrics.l4 = {
          trunk: res.regions.trunk.luma, canopy: res.regions.canopy.luma, sky: res.regions.sky.luma,
          trunkCanopyDelta: res.checks['trunk vs canopy'].delta,
          minDelta: Math.min(...Object.values(res.checks).map((c) => c.delta)),
          checks: res.checks,
        }
      }
    }
  }
  return { measured, metrics, passCount: autoPassCount(measured) }
}

// ───────────────────────── 결과 표 ─────────────────────────

export function renderResultMd(rows, { baselineName = 'baseline', at = '' } = {}) {
  const lines = [
    `# 룩 변형 검증 결과 (lookdev-variants.mjs) ${at}`,
    '',
    `기준: baseline 자동 PASS 합계(3장 × L1·L2·L3·L5). 변형은 합계를 줄이지 않고 목표를 전부 만족하면 ADOPT 후보.`,
    '',
    '| 변형 | 판정 | 자동 PASS | S3 원경 휘도 | L4 줄기/수관 Δ | L4 최소 Δ | S1 수목 bbox top | 사유 |',
    '|---|---|---|---|---|---|---|---|',
  ]
  for (const r of rows) {
    const m = r.metrics ?? {}
    lines.push(`| ${r.name}${r.name === baselineName ? ' (기준)' : ''} | **${r.verdict}** | ${r.passCount ?? '-'} | ${m.s3?.far?.luma ?? '-'} | ${m.l4?.trunkCanopyDelta ?? '-'} | ${m.l4?.minDelta ?? '-'} | ${m.s1?.treeBboxTop ?? '-'} | ${(r.reasons ?? []).join('; ') || '-'} |`)
  }
  return lines.join('\n') + '\n'
}

// ───────────────────────── 실행(브라우저·서버) ─────────────────────────

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

async function findChrome() {
  const candidates = [
    join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
  for (const c of candidates) {
    try { await access(c); return c } catch { /* next */ }
  }
  throw new Error('Chrome executable not found')
}

/** run-bench.mjs startBrowser 의 인자 그대로(CDP 없이 — 종료는 probe-server 의 RESULT 로그로 판정). */
export function chromeArgs(profile, url) {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu-sandbox', '--enable-unsafe-webgpu', '--use-angle=d3d11',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, '--window-size=1280,720', url,
  ]
}

async function killChromeProfile(profileTag) {
  if (process.platform !== 'win32') return
  const command = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${profileTag}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], { windowsHide: true }).catch(() => {})
}

function npm() { return process.platform === 'win32' ? [process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm']] : ['npm', []] }

function run(command, args) {
  return new Promise((res, rej) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true })
    child.once('error', rej)
    child.once('exit', (code) => (code === 0 ? res() : rej(new Error(`${command} ${args.join(' ')} exited ${code}`))))
  })
}

/** 캡처 1회: probe-server(1건 대기) + Chrome → RESULT 로그 → Docs/m0a/<name>.{png,json} 을 outDir 로 이동. */
async function captureOne(item, { outDir, port, timeoutMs, chromePath }) {
  const server = spawn(process.execPath, [join(HERE, 'probe-server.mjs'), String(port), '1', String(timeoutMs)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let log = ''
  const done = new Promise((res) => {
    server.stdout.on('data', (c) => { log += c; if (log.includes(`RESULT ${item.name} `)) res('ok') })
    server.once('exit', () => res(log.includes(`RESULT ${item.name} `) ? 'ok' : 'timeout'))
  })
  let listening = false
  for (let i = 0; i < 100 && !listening; i++) { await sleep(100); listening = log.includes('LISTENING') }
  if (!listening) { server.kill(); throw new Error('probe-server did not start') }
  const profileTag = `web3d-lv-${process.pid}-${Date.now()}`
  const profile = join(tmpdir(), profileTag)
  await mkdir(profile, { recursive: true })
  const chrome = spawn(chromePath, chromeArgs(profile, item.url), { cwd: ROOT, stdio: 'ignore', windowsHide: true })
  const status = await done
  chrome.kill()
  await killChromeProfile(profileTag)
  await sleep(500)
  if (status !== 'ok') throw new Error(`capture ${item.name}: ${status}\n${log.slice(-800)}`)
  const files = {}
  for (const ext of ['png', 'json']) {
    const from = join(ROOT, 'Docs', 'm0a', `${item.name}.${ext}`)
    const to = join(outDir, `${item.name}.${ext}`)
    if (existsSync(from)) { renameSync(from, to); files[ext] = to }
  }
  if (!files.png) throw new Error(`capture ${item.name}: png 없음(캔버스 빈 화면 → report.ts 가 5KB 미만이면 안 보낸다)`)
  return files
}

export async function main(argv) {
  const o = parseArgs(argv)
  if (o.help) { process.stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 26).map((l) => l.replace(/^\/\/ ?/, '')).join('\n') + '\n'); return 0 }
  const variants = loadVariants(o.variants)
  const outDir = resolve(ROOT, o.outDir)
  const targetsPath = join(ROOT, 'src', 'data', 'lookdev-targets.json')
  const srcText = readAllSrc()
  const allSwitches = [...new Set(variants.flatMap((v) => v.switches))]
  const supported = detectSwitches(allSwitches, srcText)
  const plan = planCaptures(variants, { shots: o.shots, port: o.port })
  const runnable = plan.filter((p) => variants.find((v) => v.name === p.variant).switches.every((s) => supported[s]))

  const header = [
    `lookdev-variants: ${variants.length} variants, ${plan.length} captures (${runnable.length} runnable), out-dir ${outDir}`,
    `switches in src: ${allSwitches.map((s) => `${s}=${supported[s] ? 'yes' : 'NO'}`).join(' ')}`,
    `build: ${o.skipBuild ? 'skip (dist 재사용)' : 'npm run build (1회)'} · port ${o.port} · settle ${o.settleMs}ms(report.ts shot 지연 12000 고정) · timeout ${o.timeoutMs}ms`,
    `예상 소요: 빌드 ~40s + 캡처 ${runnable.length} × ~25s ≈ ${Math.round(40 + runnable.length * 25)}s`,
  ]
  process.stdout.write(header.join('\n') + '\n')

  if (o.dryRun) {
    for (const v of variants) {
      const ok = v.switches.every((s) => supported[s])
      process.stdout.write(`\n[${v.name}] ${ok ? '' : 'UNSUPPORTED (스위치 미구현: ' + v.switches.filter((s) => !supported[s]).join(',') + ') '}${v.label}\n  targets: ${v.targets.map((t) => `${t.metric} ${t.op} ${t.value}`).join(', ') || '(기준)'}\n`)
      for (const p of plan.filter((p) => p.variant === v.name)) {
        process.stdout.write(`  ${p.kind.padEnd(6)} ${p.shot} → ${join(o.outDir, p.name + '.png')}\n         node Automation/probe-server.mjs ${o.port} 1 ${o.timeoutMs} & chrome ${chromeArgs('<tmp-profile>', p.url).slice(-1)[0]}\n`)
      }
      process.stdout.write(`  measure: ${v.shots.map((s) => `measure.mjs ${join(o.outDir, `lv-${v.name}-${s}.png`)} --targets src/data/lookdev-targets.json`).join(' ; ')}\n`)
      if (v.noHero.length) process.stdout.write(`  l4: ${v.noHero.map((s) => `l4-contrast.mjs --color lv-${v.name}-${s}.png --nohero lv-${v.name}-${s}-nohero.png --bw lv-${v.name}-${s}-bw.png${s === 'S2' ? ' --bbox 553,89,739,302' : ''}`).join(' ; ')}\n`)
    }
    process.stdout.write(`\n결과: ${join(o.outDir, 'variants-result.md')} + variants-result.json\n`)
    return 0
  }

  // ── 실행 ──
  const distIndex = join(ROOT, 'dist', 'index.html')
  if (o.skipBuild) { if (!existsSync(distIndex)) throw new Error('--skip-build 인데 dist/index.html 이 없다') }
  else { const [cmd, pre] = npm(); await run(cmd, [...pre, 'run', 'build']) }
  mkdirSync(outDir, { recursive: true })
  const chromePath = await findChrome()

  const captured = {} // variant → shot → {color, nohero}
  for (const item of runnable) {
    let files = null
    for (let attempt = 1; attempt <= 2 && !files; attempt++) {
      process.stdout.write(`\n▶ ${item.name} (attempt ${attempt}) ${item.url}\n`)
      const f = await captureOne(item, { outDir, port: o.port, timeoutMs: o.timeoutMs, chromePath })
      const m = measure(readFileSync(f.png), { file: f.png })
      const pair = captured[item.variant]?.[item.shot]?.colorTop
      const unloaded = looksUnloaded(m) || (item.kind === 'nohero' && pair != null && Math.abs(m.bands[0].luma - pair) > 15)
      if (unloaded && attempt === 1) { process.stdout.write(`  ⚠ HDR 미로드 의심(상단 밴드 ${m.bands[0].luma}) → 재캡처\n`); continue }
      files = f
      captured[item.variant] ??= {}
      captured[item.variant][item.shot] ??= {}
      captured[item.variant][item.shot][item.kind] = f.png
      if (item.kind === 'color') captured[item.variant][item.shot].colorTop = m.bands[0].luma
    }
  }

  const rows = []
  const baseline = variants.find((v) => v.name === 'baseline')
  const baselineResult = computeMetrics(captured.baseline ?? {}, { targetsPath })
  rows.push({ name: 'baseline', verdict: '기준', passCount: baselineResult.passCount, metrics: baselineResult.metrics, reasons: [] })
  for (const v of variants) {
    if (v === baseline) continue
    const ok = v.switches.every((s) => supported[s])
    if (!ok) { rows.push({ name: v.name, ...judge(baselineResult, { supported: false, missing: v.switches.filter((s) => !supported[s]) }), passCount: null, metrics: null }); continue }
    const r = computeMetrics(captured[v.name] ?? {}, { targetsPath, baselineMeasured: baselineResult.measured, reuseBaselineFor: v.reuseBaselineFor })
    const verdict = judge(baselineResult, { name: v.name, supported: true, passCount: r.passCount, metrics: r.metrics, targets: v.targets })
    rows.push({ name: v.name, ...verdict, passCount: r.passCount, metrics: r.metrics })
  }
  const at = new Date().toISOString()
  writeFileSync(join(outDir, 'variants-result.json'), JSON.stringify({ schema: 'lookdev-variants/1', at, variants, supported, rows }, null, 2) + '\n')
  writeFileSync(join(outDir, 'variants-result.md'), renderResultMd(rows, { at }))
  process.stdout.write('\n' + renderResultMd(rows, { at }))
  return 0
}

function readAllSrc() {
  // src/**/*.ts(x) 텍스트를 이어 붙인다 — 쿼리 스위치 존재 확인용.
  const out = []
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e)) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(ROOT, 'src'))
  return out.join('\n')
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((e) => { process.stderr.write(`lookdev-variants: ${e.message}\n`); process.exit(1) })
}
