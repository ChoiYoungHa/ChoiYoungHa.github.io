#!/usr/bin/env node
// R52-A — L4(흑백 실루엣) 정량화. 계획서 §6-2 "흑백에서 줄기/수관/하늘 3체크" 를 숫자로 만든다.
//
// 입력: 나무 있음 컬러 PNG(--color) · 나무 없음 컬러 PNG(--nohero, ?hideHero=1) · 흑백 PNG(--bw)
// 방법: color−nohero 차분(채널 최대 |Δ| ≥ --threshold, 기본 24)으로 나무 픽셀 마스크를 만들고,
//       흑백 이미지에서 ① 수관 = bbox 상단 1/3 의 마스크 픽셀 ② 줄기 = bbox 하단 1/3 의 마스크 픽셀
//       ③ 하늘 = bbox 좌우 --skyMargin(기본 40px) 띠 안의 **비마스크** 픽셀(같은 행 범위, 상단 2/3 — 지면·집 제외)
//       의 Rec.709 평균 휘도(0~255)와 세 쌍의 Δ 를 낸다.
// bbox: --bbox l,t,r,b 를 주면 그 안의 마스크만 쓴다(기존 Docs/qa/m3-l4-s3.json 좌표 재사용).
//       안 주면 마스크 전체 bbox 를 쓴다 — 수목 그림자(마을 위 220m)가 섞이므로 --bbox 권장(R48 교훈 1).
// 판정: --delta(기본 10) 이상이면 pass. 판정 문턱은 추정값이고 최종 판정은 master 가 한다(json 에 그대로 적는다).
// PNG 디코더는 measure.mjs 의 것을 그대로 쓴다(의존성 0). 흑백(gray) PNG 만 같은 로직으로 여기서 펼친다.
//
// 실행: node Automation/l4-contrast.mjs --color Docs/lookdev/m3-after-1.png --nohero Docs/lookdev/m3-l4nohero2-1.png \
//         --bw Docs/lookdev/m3-after-1-bw.png --bbox 553,89,739,302 --out Docs/qa/m3-l4-contrast.json

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { decodePng as decodePngRgb, luma709 } from './measure.mjs'

/**
 * measure.mjs 의 decodePng 는 RGB/RGBA 만 받는다. 흑백 캡처(`*-bw.png`)는 colorType 0(gray) 이라
 * 그 파일을 고치지 않고(M3-17 재현성) 여기서 같은 필터 해제 로직으로 gray/gray+alpha 를 RGB 3채널로 펼친다.
 * RGB/RGBA 는 measure.mjs 로 그대로 위임한다.
 */
export function decodePng(buf) {
  const ct = pngColorType(buf)
  if (ct === 2 || ct === 6) return decodePngRgb(buf)
  if (ct !== 0 && ct !== 4) throw new Error(`unsupported PNG colorType ${ct}`)
  return decodeGray(buf, ct === 4 ? 2 : 1)
}

function pngColorType(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10]
  if (buf.length < 33 || SIG.some((v, i) => buf[i] !== v)) throw new Error('not a PNG (signature mismatch)')
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('PNG without leading IHDR')
  return buf[16 + 9]
}

function decodeGray(buf, channels) {
  let pos = 8
  let ihdr = null
  const idat = []
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], interlace: data[12] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const { width, height, bitDepth, interlace } = ihdr
  if (bitDepth !== 8) throw new Error(`unsupported PNG: bitDepth ${bitDepth} (8 only)`)
  if (interlace !== 0) throw new Error('unsupported PNG: interlaced')
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG data size mismatch: got ${raw.length}`)
  const gray = Buffer.alloc(stride * height)
  const bpp = channels
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = gray.subarray(y * stride, (y + 1) * stride)
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
  // gray → RGB 3채널(luma709(g,g,g) == g)
  const out = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const g = gray[i * channels]
    out[i * 3] = g
    out[i * 3 + 1] = g
    out[i * 3 + 2] = g
  }
  return { width, height, channels: 3, data: out, sourceColorType: channels === 2 ? 4 : 0 }
}

function parseArgs(argv) {
  const o = { threshold: 24, delta: 10, skyMargin: 40, bbox: null, out: null, label: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--color') o.color = next()
    else if (a === '--nohero') o.nohero = next()
    else if (a === '--bw') o.bw = next()
    else if (a === '--out') o.out = next()
    else if (a === '--label') o.label = next()
    else if (a === '--threshold') o.threshold = Number(next())
    else if (a === '--delta') o.delta = Number(next())
    else if (a === '--skyMargin') o.skyMargin = Number(next())
    else if (a === '--bbox') {
      const [left, top, right, bottom] = next().split(',').map(Number)
      o.bbox = { left, top, right, bottom }
    } else throw new Error(`unknown arg ${a}`)
  }
  for (const k of ['color', 'nohero', 'bw']) if (!o[k]) throw new Error(`--${k} required`)
  return o
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex')
const r1 = (v) => Math.round(v * 10) / 10

function meanLuma(img, pixels) {
  if (pixels.length === 0) return { mean: NaN, count: 0 }
  let sum = 0
  for (const idx of pixels) {
    const o = idx * img.channels
    sum += luma709(img.data[o], img.data[o + 1], img.data[o + 2])
  }
  return { mean: sum / pixels.length, count: pixels.length }
}

export function l4Contrast({ color, nohero, bw, threshold = 24, delta = 10, skyMargin = 40, bbox = null }) {
  if (color.width !== nohero.width || color.height !== nohero.height || color.width !== bw.width || color.height !== bw.height) {
    throw new Error('image size mismatch between color / nohero / bw')
  }
  const { width, height } = color
  // ① 차분 마스크
  const mask = new Uint8Array(width * height)
  let maskCount = 0
  let full = { left: width, top: height, right: -1, bottom: -1 }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const a = i * color.channels
      const b = i * nohero.channels
      const d = Math.max(
        Math.abs(color.data[a] - nohero.data[b]),
        Math.abs(color.data[a + 1] - nohero.data[b + 1]),
        Math.abs(color.data[a + 2] - nohero.data[b + 2]),
      )
      if (d >= threshold) {
        mask[i] = 1
        maskCount++
        if (x < full.left) full.left = x
        if (x > full.right) full.right = x
        if (y < full.top) full.top = y
        if (y > full.bottom) full.bottom = y
      }
    }
  }
  if (maskCount === 0) throw new Error('diff mask is empty — 두 캡처가 같거나 threshold 가 너무 크다')
  const box = bbox ?? full
  const rows = box.bottom - box.top + 1
  const third = rows / 3
  const canopyBottom = box.top + third // [top, top+third)
  const trunkTop = box.bottom + 1 - third // [bottom+1-third, bottom]
  const canopy = [], trunk = [], skyL = [], skyR = [], treeInBox = []
  for (let y = box.top; y <= box.bottom; y++) {
    for (let x = box.left; x <= box.right; x++) {
      const i = y * width + x
      if (!mask[i]) continue
      treeInBox.push(i)
      if (y < canopyBottom) canopy.push(i)
      else if (y >= trunkTop) trunk.push(i)
    }
    // 하늘: bbox 좌우 띠, 상단 2/3 행만(하단 1/3 은 지면·집이 섞인다), 비마스크
    if (y < box.top + third * 2) {
      for (let x = Math.max(0, box.left - skyMargin); x < box.left; x++) if (!mask[y * width + x]) skyL.push(y * width + x)
      for (let x = box.right + 1; x <= Math.min(width - 1, box.right + skyMargin); x++) if (!mask[y * width + x]) skyR.push(y * width + x)
    }
  }
  const sky = skyL.concat(skyR)
  const mCanopy = meanLuma(bw, canopy)
  const mTrunk = meanLuma(bw, trunk)
  const mSky = meanLuma(bw, sky)
  const mTree = meanLuma(bw, treeInBox)
  const pair = (nameA, a, nameB, b) => {
    const dv = Math.abs(a.mean - b.mean)
    return { [nameA]: r1(a.mean), [nameB]: r1(b.mean), delta: r1(dv), threshold: delta, pass: dv >= delta }
  }
  return {
    image: { width, height },
    diff: { threshold, maskPixels: maskCount, fullMaskBbox: full, note: '전체 마스크에는 수목 그림자(마을 위)도 포함된다 — 실루엣은 bbox 안만 쓴다' },
    bbox: box,
    bboxSource: bbox ? 'argument' : 'diff',
    regions: {
      canopy: { rows: [box.top, Math.ceil(canopyBottom) - 1], pixels: mCanopy.count, luma: r1(mCanopy.mean) },
      trunk: { rows: [Math.floor(trunkTop), box.bottom], pixels: mTrunk.count, luma: r1(mTrunk.mean) },
      sky: { columns: [[Math.max(0, box.left - skyMargin), box.left - 1], [box.right + 1, Math.min(width - 1, box.right + skyMargin)]], rows: [box.top, Math.ceil(box.top + third * 2) - 1], pixels: mSky.count, left: mSky.count ? r1(meanLuma(bw, skyL).mean) : null, right: mSky.count ? r1(meanLuma(bw, skyR).mean) : null, luma: r1(mSky.mean) },
      treeAll: { pixels: mTree.count, luma: r1(mTree.mean) },
    },
    checks: {
      'trunk vs sky': pair('trunk', mTrunk, 'sky', mSky),
      'canopy vs sky': pair('canopy', mCanopy, 'sky', mSky),
      'trunk vs canopy': pair('trunk', mTrunk, 'canopy', mCanopy),
    },
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const o = parseArgs(process.argv.slice(2))
  const bufs = { color: readFileSync(o.color), nohero: readFileSync(o.nohero), bw: readFileSync(o.bw) }
  const res = l4Contrast({
    color: decodePng(bufs.color), nohero: decodePng(bufs.nohero), bw: decodePng(bufs.bw),
    threshold: o.threshold, delta: o.delta, skyMargin: o.skyMargin, bbox: o.bbox,
  })
  const passCount = Object.values(res.checks).filter((c) => c.pass).length
  const out = {
    schema: 'l4-contrast/1',
    label: o.label,
    files: { color: o.color, nohero: o.nohero, bw: o.bw },
    sha256: { color: sha(bufs.color), nohero: sha(bufs.nohero), bw: sha(bufs.bw) },
    method: `color−nohero 차분(채널 최대 |Δ|≥${o.threshold}) 마스크 → 흑백 Rec.709 평균 휘도. 수관=bbox 상단 1/3 마스크, 줄기=하단 1/3 마스크, 하늘=bbox 좌우 ${o.skyMargin}px 띠·상단 2/3 행·비마스크. Δ≥${o.delta} 이면 pass(문턱은 추정값, 판정은 master).`,
    ...res,
    summary: { passCount, total: 3, formDistinguishable: passCount === 3 ? 'all 3 pairs ≥ threshold' : `${passCount}/3 pairs ≥ threshold — master 판정 필요` },
  }
  const text = JSON.stringify(out, null, 2)
  if (o.out) writeFileSync(o.out, text + '\n')
  process.stdout.write(text + '\n')
}
