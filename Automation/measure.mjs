#!/usr/bin/env node
// M3-17 — 룩디브 자동 측정 (계획서 §6-4). 의존성 0: PNG 는 Node 내장 zlib 로 직접 디코딩한다.
//
// 사용: node Automation/measure.mjs <png> [--targets src/data/lookdev-targets.json] [--out <json>]
// exit 0 = 측정 완료(판정 FAIL 이어도 0). exit 2 = 입력·형식 오류(지원하지 않는 PNG 등).
//
// 지원 PNG: 8비트 · colortype 2(RGB) 또는 6(RGBA) · non-interlaced 만. 그 외는 명확한 에러로 종료한다.
// 알파는 무시한다(캔버스 toDataURL 은 불투명). 알파<255 픽셀 수는 `alphaBelow255` 로만 보고한다.
//
// 측정 정의(§6-1 실측을 재현하는 정의 — 목표 이미지에서 밴드3 8.1% · 밴드7 35.8% · 휘도 144→62 · 전역 18.3% 재현):
//   밴드      : 세로 8밴드, band i = [floor(i*H/8), floor((i+1)*H/8))
//   채도      : 밴드 안 픽셀별 HSL S 의 평균 (0~100). 평균색의 채도가 아니다.
//   색상      : 밴드 평균 RGB 의 HSL hue (0~360)
//   휘도      : 밴드 평균 RGB 의 Rec.709 luma 0.2126R+0.7152G+0.0722B (0~255)
//   전역 채도 : 전 픽셀 HSL S 의 중앙값 (0~100). 0.1% 히스토그램, 짝수 개수면 하위 중앙값(ceil(N/2) 번째)
//   근경/원경 : targets.regions (기본 near=[6,7] 픽셀 가중 통합, far=[2])
//
// 출력 스키마 (JSON, stdout 과 --out 동일):
// {
//   schema: "lookdev-measure/1",
//   file, sha256, width, height, channels, alphaBelow255,
//   targets: <targets 파일 경로 | null>,
//   bands: [{ index, y0, y1, pixels, meanRgb:{r,g,b}, hex, hsl:{h,s,l}, saturationPct, hueDeg, luma }] × 8,
//   global: { saturationMedianPct },
//   regions: { near:{ bands, pixels, hex, saturationPct, hueDeg, luma }, far:{ … } },
//   checks: {
//     L1: { metric, near:{value,range,pass}, far:{value,range,pass}, pass },
//     L2: 동일, L3: 동일,
//     L4: { manual:true, pass:null, method },
//     L5: { metric, value, max, pass }
//   },
//   summary: { autoJudged:4, passCount, failCount, manual:["L4"] }
// }
// targets 가 없으면 checks/summary 는 null 이다(측정값만).

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

function cli(args) {
if (args.length === 0 || args.includes('--help')) {
  process.stdout.write('usage: node Automation/measure.mjs <png> [--targets <json>] [--out <json>]\n')
  process.exit(args.length === 0 ? 2 : 0)
}
let file = null
let targetsPath = null
let outPath = null
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--targets') targetsPath = args[++i]
  else if (a === '--out') outPath = args[++i]
  else if (a.startsWith('--')) fail(`unknown option: ${a}`)
  else file = a
}
if (!file) fail('png path required')

try {
  const buf = readFileSync(file)
  const targets = targetsPath ? JSON.parse(readFileSync(targetsPath, 'utf8')) : null
  const result = measure(buf, { file, targets, targetsPath })
  const text = JSON.stringify(result, null, 2)
  if (outPath) {
    mkdirSync(dirname(resolve(outPath)), { recursive: true })
    writeFileSync(outPath, text + '\n', 'utf8')
  }
  process.stdout.write(text + '\n')
  process.exit(0)
} catch (e) {
  fail(e instanceof Error ? e.message : String(e))
}
}

function fail(msg) {
  process.stderr.write(`measure.mjs: ${msg}\n`)
  process.exit(2)
}

// ───────────────────────── PNG 디코더 (8bit RGB/RGBA, non-interlaced) ─────────────────────────

export function decodePng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  if (buf.length < 8 || SIG.some((v, i) => buf[i] !== v)) throw new Error('not a PNG (signature mismatch)')
  let pos = 8
  let ihdr = null
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      }
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (!ihdr) throw new Error('PNG without IHDR')
  const { width, height, bitDepth, colorType, interlace } = ihdr
  if (bitDepth !== 8) throw new Error(`unsupported PNG: bitDepth ${bitDepth} (8 only)`)
  if (colorType !== 2 && colorType !== 6)
    throw new Error(`unsupported PNG: colorType ${colorType} (2=RGB or 6=RGBA only; palette/gray unsupported)`)
  if (interlace !== 0) throw new Error('unsupported PNG: interlaced (Adam7) not supported')
  if (idat.length === 0) throw new Error('PNG without IDAT')
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length !== (stride + 1) * height)
    throw new Error(`PNG data size mismatch: got ${raw.length}, expected ${(stride + 1) * height}`)
  const out = Buffer.alloc(stride * height)
  const bpp = channels
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      let v = line[i]
      switch (ft) {
        case 0: break
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          break
        }
        default: throw new Error(`bad PNG filter type ${ft} at row ${y}`)
      }
      cur[i] = v & 255
    }
    prev = cur
  }
  return { width, height, channels, data: out }
}

// ───────────────────────── 색 공식 ─────────────────────────

/** HSL 채도 0~1. max==min 이면 0. */
export function hslSaturation(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  if (max === min) return 0
  const l = (max + min) / 2
  const d = max - min
  return l > 0.5 ? d / (2 - max - min) : d / (max + min)
}

/** 평균색용 HSL. h 0~360, s·l 0~1. */
export function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0)
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  return { h: h * 60, s, l }
}

export function luma709(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const hex2 = (v) => Math.round(v).toString(16).padStart(2, '0')
const toHex = (r, g, b) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase()
const r1 = (v) => Math.round(v * 10) / 10

// ───────────────────────── 측정 ─────────────────────────

export function measure(buf, { file = null, targets = null, targetsPath = null } = {}) {
  const { width, height, channels, data } = decodePng(buf)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const BANDS = targets?.bands?.count ?? 8
  const total = width * height
  // 채도 히스토그램(0.1% 해상도, 1001 bin)으로 중앙값 — 픽셀 수만큼 배열을 잡지 않는다.
  const hist = new Uint32Array(1001)
  let alphaBelow255 = 0
  const bands = []
  for (let bi = 0; bi < BANDS; bi++) {
    const y0 = Math.floor((bi * height) / BANDS)
    const y1 = Math.floor(((bi + 1) * height) / BANDS)
    let sr = 0, sg = 0, sb = 0, ss = 0, n = 0
    for (let y = y0; y < y1; y++) {
      let p = y * width * channels
      for (let x = 0; x < width; x++, p += channels) {
        const r = data[p], g = data[p + 1], b = data[p + 2]
        if (channels === 4 && data[p + 3] < 255) alphaBelow255++
        const s = hslSaturation(r, g, b)
        sr += r; sg += g; sb += b; ss += s; n++
        hist[Math.round(s * 1000)]++
      }
    }
    const mr = sr / n, mg = sg / n, mb = sb / n
    const hsl = rgbToHsl(mr, mg, mb)
    bands.push({
      index: bi, y0, y1, pixels: n,
      meanRgb: { r: r1(mr), g: r1(mg), b: r1(mb) },
      hex: toHex(mr, mg, mb),
      hsl: { h: Math.round(hsl.h), s: Math.round(hsl.s * 100), l: Math.round(hsl.l * 100) },
      saturationPct: r1((ss / n) * 100),
      hueDeg: r1(hsl.h),
      luma: r1(luma709(mr, mg, mb)),
      _sum: { sr, sg, sb, ss, n },
    })
  }
  // 중앙값: 누적 히스토그램에서 ceil(total/2) 번째(짝수 개수면 하위 중앙값). 0.1% 해상도.
  let acc = 0, medianBin = 0
  const half = Math.ceil(total / 2)
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= half) { medianBin = i; break } }
  const saturationMedianPct = r1(medianBin / 10)

  const regionOf = (idx) => {
    const sel = idx.map((i) => bands[i]._sum)
    const n = sel.reduce((a, s) => a + s.n, 0)
    const mr = sel.reduce((a, s) => a + s.sr, 0) / n
    const mg = sel.reduce((a, s) => a + s.sg, 0) / n
    const mb = sel.reduce((a, s) => a + s.sb, 0) / n
    const hsl = rgbToHsl(mr, mg, mb)
    return {
      bands: idx, pixels: n, hex: toHex(mr, mg, mb),
      saturationPct: r1((sel.reduce((a, s) => a + s.ss, 0) / n) * 100),
      hueDeg: r1(hsl.h),
      luma: r1(luma709(mr, mg, mb)),
    }
  }
  const nearIdx = targets?.regions?.near?.bands ?? [6, 7]
  const farIdx = targets?.regions?.far?.bands ?? [2]
  const regions = { near: regionOf(nearIdx), far: regionOf(farIdx) }
  for (const b of bands) delete b._sum

  let checks = null, summary = null
  if (targets) {
    const inRange = (v, [lo, hi]) => v >= lo && v <= hi
    const pair = (L, key) => {
      const near = { value: regions.near[key], range: targets[L].near, pass: inRange(regions.near[key], targets[L].near) }
      const far = { value: regions.far[key], range: targets[L].far, pass: inRange(regions.far[key], targets[L].far) }
      return { title: targets[L].title, metric: key, near, far, pass: near.pass && far.pass }
    }
    checks = {
      L1: pair('L1', 'saturationPct'),
      L2: pair('L2', 'hueDeg'),
      L3: pair('L3', 'luma'),
      L4: { title: targets.L4.title, manual: true, pass: null, method: targets.L4.method },
      L5: {
        title: targets.L5.title, metric: 'globalSaturationMedianPct',
        value: saturationMedianPct, max: targets.L5.max, pass: saturationMedianPct <= targets.L5.max,
      },
    }
    const auto = ['L1', 'L2', 'L3', 'L5']
    const passCount = auto.filter((k) => checks[k].pass).length
    summary = { autoJudged: auto.length, passCount, failCount: auto.length - passCount, manual: ['L4'] }
  }

  return {
    schema: 'lookdev-measure/1',
    file, sha256, width, height, channels, alphaBelow255,
    targets: targetsPath,
    bands, global: { saturationMedianPct }, regions, checks, summary,
    definitions: {
      saturationPct: 'mean of per-pixel HSL S (0~100)',
      hueDeg: 'HSL hue of band mean RGB',
      luma: 'Rec.709 luma of band mean RGB (0~255)',
      globalSaturationMedianPct: 'median of per-pixel HSL S (0.1 resolution, lower median for even N)',
      bands: `band i = [floor(i*H/${BANDS}), floor((i+1)*H/${BANDS}))`,
    },
  }
}

// 직접 실행일 때만 CLI 로 동작한다(파일 끝: 위의 const 헬퍼가 초기화된 뒤여야 한다).
// test-measure.mjs 는 이 파일을 import 해서 함수만 쓴다.
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) cli(process.argv.slice(2))
