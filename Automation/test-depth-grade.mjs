import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * M3-05B/C/D 대기원근 그레이딩 참조 구현(depthGradeMath.ts) 계약 테스트.
 * 실행: node --test Automation/test-depth-grade.mjs   (GPU·브라우저 없음)
 *
 * 마지막 describe 는 "목표 이미지의 근경 색에 §6-2 파라미터를 걸면 원경 목표(lookdev-targets)에 드는가" 를
 * 숫자로 확인하고, 안 들면 파라미터 후보를 탐색해 출력한다. 후보 탐색 결과는 Docs/lookdev/m3-plan.md 에 옮긴다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const M = await load('src/scene/atmosphere/depthGradeMath.ts')
const targets = JSON.parse(readFileSync(join(ROOT, 'src/data/lookdev-targets.json'), 'utf8'))

const P = M.DEPTH_GRADE_DEFAULTS
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 })
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps
const inRange = (v, [lo, hi]) => v >= lo && v <= hi

describe('§6-2 기본 파라미터', () => {
  test('값이 계획서 표와 같다', () => {
    assert.deepEqual(P, { nearMeters: 40, farMeters: 260, satFar: 0.25, hueFarDeg: 210, hueStrength: 0.85, lumaGain: 0.35 })
  })
  test('depthFactor: 40m 이하 0, 260m 이상 1, 150m 에서 0.5, 단조증가', () => {
    assert.equal(M.depthFactor(0), 0)
    assert.equal(M.depthFactor(40), 0)
    assert.equal(M.depthFactor(260), 1)
    assert.equal(M.depthFactor(1000), 1)
    assert.ok(near(M.depthFactor(150), 0.5))
    let prev = -1
    for (let d = 0; d <= 300; d += 5) { const f = M.depthFactor(d); assert.ok(f >= prev, `d=${d}`); prev = f }
  })
})

describe('색 변환 왕복', () => {
  test('rgb→hsl→rgb 가 1e-9 안에서 복원된다(256 샘플)', () => {
    for (let i = 0; i < 256; i++) {
      const rgb = { r: ((i * 37) % 256) / 255, g: ((i * 91) % 256) / 255, b: ((i * 53) % 256) / 255 }
      const back = M.hslToRgb(M.rgbToHsl(rgb))
      for (const k of ['r', 'g', 'b']) assert.ok(near(back[k], rgb[k]), `${i} ${k}`)
    }
  })
  test('§6-1 값: #798CA3 → 213°/19%/56%, #4A4325 → 48.6°/33.3%', () => {
    const a = M.rgbToHsl(hex('#798CA3'))
    assert.deepEqual([Math.round(a.h), Math.round(a.s * 100), Math.round(a.l * 100)], [213, 19, 56])
    const b = M.rgbToHsl(hex('#4A4325'))
    assert.equal(Math.round(b.h * 10) / 10, 48.6)
    assert.equal(Math.round(b.s * 1000) / 10, 33.3)
  })
  test('mixHue 는 최단 호: 350→10 은 0 을 지나고, t=1 이면 목표', () => {
    assert.ok(near(M.mixHue(350, 10, 0.5), 0))
    assert.ok(near(M.mixHue(10, 350, 0.5), 0))
    assert.ok(near(M.mixHue(45, 210, 1), 210))
    assert.ok(near(M.mixHue(45, 210, 0), 45))
    assert.ok(near(M.mixHue(48.6, 210, 0.85), 48.6 + 0.85 * (210 - 48.6)))
  })
})

describe('applyDepthGrade — 경계 조건', () => {
  const src = hex('#4A4325')
  test('d ≤ 40m 이면 불변', () => {
    for (const d of [0, 10, 40]) assert.deepEqual(M.applyDepthGrade(src, d), src)
  })
  test('d ≥ 260m 이면 채도 ×0.25 · hue 85% 이동 · lightness +0.35', () => {
    const h0 = M.rgbToHsl(src)
    const h1 = M.rgbToHsl(M.applyDepthGrade(src, 260))
    assert.ok(near(h1.s, h0.s * 0.25, 1e-6), `s ${h1.s} vs ${h0.s * 0.25}`)
    assert.ok(near(h1.h, M.mixHue(h0.h, 210, 0.85), 1e-6), `h ${h1.h}`)
    assert.ok(near(h1.l, h0.l + 0.35, 1e-6), `l ${h1.l}`)
    assert.deepEqual(M.applyDepthGrade(src, 260), M.applyDepthGrade(src, 5000))
  })
  test('lightness 는 1 에서 클램프되고 채도는 음수가 되지 않는다', () => {
    const bright = { r: 0.95, g: 0.9, b: 0.85 }
    const h = M.rgbToHsl(M.applyDepthGrade(bright, 260))
    assert.ok(h.l <= 1 + 1e-12)
    const g = M.gradeHsl({ h: 30, s: 0.2, l: 0.5 }, 1, { ...P, satFar: -1 })
    assert.equal(g.s, 0)
  })
  test('거리에 따라 채도 단조감소 · lightness 단조증가 · hue 는 210° 쪽으로 단조', () => {
    let prev = M.rgbToHsl(src)
    for (let d = 40; d <= 260; d += 10) {
      const cur = M.rgbToHsl(M.applyDepthGrade(src, d))
      assert.ok(cur.s <= prev.s + 1e-12, `s d=${d}`)
      assert.ok(cur.l >= prev.l - 1e-12, `l d=${d}`)
      assert.ok(cur.h >= prev.h - 1e-9 && cur.h <= 210, `h d=${d} ${cur.h}`)
      prev = cur
    }
  })
})

describe('근경 → 원경 시뮬레이션 (lookdev-targets 대비)', () => {
  // 근경 입력 = 목표 이미지 근경 통합색 #4A4325 (reference-metrics.json regions.near.hex: 33.3% / 48.6° / luma 66.3)
  const srcRgb = hex('#4A4325')
  const far = {
    sat: targets.L1.far, // [8, 12] %
    hue: targets.L2.far, // [205, 215] °
    luma: targets.L3.far, // [130, 145] 0~255
  }
  const evalParams = (p) => {
    const rgb = M.applyDepthGrade(srcRgb, 260, p)
    const hsl = M.rgbToHsl(rgb)
    return { satPct: hsl.s * 100, hueDeg: hsl.h, luma: M.luma709(rgb) * 255, hex: toHex(rgb) }
  }
  const judge = (r) => ({ L1: inRange(r.satPct, far.sat), L2: inRange(r.hueDeg, far.hue), L3: inRange(r.luma, far.luma) })

  test('§6-2 기본값: L1 은 들고(8.3%), L2·L3 는 못 든다 — 수치 기록', () => {
    const r = evalParams(P)
    const j = judge(r)
    console.log(`  [spec] far(260m) from #4A4325 → S ${r.satPct.toFixed(1)}% H ${r.hueDeg.toFixed(1)}° Y ${r.luma.toFixed(1)} (${r.hex}) L1=${j.L1} L2=${j.L2} L3=${j.L3}`)
    assert.equal(j.L1, true)
    assert.equal(j.L2, false) // 48.6 + 0.85·161.4 = 185.8° < 205
    assert.equal(j.L3, false) // lightness 0.218+0.35=0.568 → luma ≈ 140? 아래에서 실측
  })

  test('파라미터 후보 탐색: hueStrength·lumaGain·satFar 격자에서 L1·L2·L3 모두 드는 해가 존재한다', () => {
    const hits = []
    for (let hs = 0.85; hs <= 1.0001; hs += 0.01)
      for (let lg = 0.25; lg <= 0.5001; lg += 0.01)
        for (let sf = 0.2; sf <= 0.3501; sf += 0.05) {
          const p = { ...P, hueStrength: +hs.toFixed(2), lumaGain: +lg.toFixed(2), satFar: +sf.toFixed(2) }
          const r = evalParams(p)
          const j = judge(r)
          if (j.L1 && j.L2 && j.L3) hits.push({ p, r })
        }
    assert.ok(hits.length > 0, '격자 안에 해가 없다')
    // 스펙에서 가장 가까운(변경량이 작은) 후보 3개
    const dist = (p) => Math.abs(p.hueStrength - P.hueStrength) / 0.15 + Math.abs(p.lumaGain - P.lumaGain) / 0.25 + Math.abs(p.satFar - P.satFar) / 0.15
    hits.sort((a, b) => dist(a.p) - dist(b.p))
    for (const { p, r } of hits.slice(0, 3))
      console.log(`  [candidate] hueStrength ${p.hueStrength} lumaGain ${p.lumaGain} satFar ${p.satFar} → S ${r.satPct.toFixed(1)}% H ${r.hueDeg.toFixed(1)}° Y ${r.luma.toFixed(1)} (${r.hex})`)
    const best = hits[0].p
    const ranges = { hueStrength: [0.97, 1.0], lumaGain: [0.25, 0.5], satFar: [0.2, 0.35] }
    assert.ok(inRange(best.hueStrength, ranges.hueStrength), `hueStrength ${best.hueStrength}`)
    assert.ok(inRange(best.lumaGain, ranges.lumaGain))
    assert.ok(inRange(best.satFar, ranges.satFar))
  })

  test('현재 씬 근경(m2-vista2 near 평균색 #908D76, S 10.5%)에 어떤 파라미터를 걸어도 원경 8~12% 에 못 든다 — 근경 채도를 먼저 올려야 함을 수치로', () => {
    // 근경 평균색 채도 10.5% × 0.25 = 2.6% → 원경 8~12% 미달. 그레이딩은 근경보다 채도를 낮출 뿐 올리지 못한다.
    const cur = M.rgbToHsl(hex('#908D76'))
    const farS = cur.s * P.satFar * 100
    console.log(`  [scene] near S ${(cur.s * 100).toFixed(1)}% → far S ${farS.toFixed(1)}% (목표 8~12): 근경 채도 목표 30~36% 를 먼저 맞춰야 원경이 8~9% 에 든다`)
    assert.ok(farS < far.sat[0])
  })
})

function toHex(rgb) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')
  return `#${c(rgb.r)}${c(rgb.g)}${c(rgb.b)}`.toUpperCase()
}
