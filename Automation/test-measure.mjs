import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

/**
 * M3-17 measure.mjs 계약 테스트.
 * 실행: node --test Automation/test-measure.mjs
 *
 * fixture 는 이 파일 안에서 합성한다(PNG 인코더도 zlib 만 사용) — 외부 이미지·GPU·브라우저 없음.
 * 기대값은 measure.mjs 를 거치지 않고 문서화된 공식(픽셀별 HSL S 평균·평균색 hue·Rec.709 luma·S 중앙값)으로
 * 독립 계산한다. 색 공식 자체는 §6-1 표의 값(#8193A2 → 144.0 등)으로 못박는다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const MEASURE = join(ROOT, 'Automation', 'measure.mjs')
const TARGETS = join(ROOT, 'src', 'data', 'lookdev-targets.json')
const { measure, decodePng, hslSaturation, rgbToHsl, luma709 } = await import(new URL('./measure.mjs', import.meta.url).href)

// ───────── 최소 PNG 인코더 (테스트 전용) ─────────
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}
/** pixels: (x,y) => [r,g,b] | [r,g,b,a]. filterOf(y) 로 행별 필터 타입을 고른다(디코더 5종 검증). */
function encodePng(width, height, pixels, { channels = 3, filterOf = () => 0, bitDepth = 8, colorType, interlace = 0 } = {}) {
  const ct = colorType ?? (channels === 4 ? 6 : 2)
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < width; x++) {
      const p = pixels(x, y)
      for (let c = 0; c < channels; c++) cur[x * channels + c] = p[c] ?? 255
    }
    const ft = filterOf(y)
    raw[y * (stride + 1)] = ft
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0
      let pred = 0
      if (ft === 1) pred = a
      else if (ft === 2) pred = b
      else if (ft === 3) pred = (a + b) >> 1
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      raw[y * (stride + 1) + 1 + i] = (cur[i] - pred) & 255
    }
    prev = cur
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = bitDepth; ihdr[9] = ct; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
// 하위 중앙값(ceil(N/2) 번째) — measure.mjs 와 같은 규약
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.ceil(s.length / 2) - 1] }

describe('색 공식 — §6-1 표의 값을 재현한다', () => {
  test('Rec.709 luma: #8193A2 → 144.3, #473E24 → 62.0 (§6-1 표 144.0/62.1 은 밴드 평균색의 반올림 전 값 — 목표 이미지 실측은 reference-metrics.json 이 재현)', () => {
    assert.equal(Math.round(luma709(...hex('#8193A2')) * 10) / 10, 144.3)
    assert.equal(Math.round(luma709(...hex('#473E24')) * 10) / 10, 62.0)
    assert.ok(Math.abs(luma709(255, 255, 255) - 255) < 1e-9)
    assert.equal(luma709(0, 0, 0), 0)
  })
  test('HSL: #798CA3 → 213°/19%/56%, #473E24 → 45°/33%/21%', () => {
    const a = rgbToHsl(...hex('#798CA3'))
    assert.deepEqual([Math.round(a.h), Math.round(a.s * 100), Math.round(a.l * 100)], [213, 19, 56])
    const b = rgbToHsl(...hex('#473E24'))
    assert.deepEqual([Math.round(b.h), Math.round(b.s * 100), Math.round(b.l * 100)], [45, 33, 21])
    assert.equal(hslSaturation(...hex('#473E24')), b.s)
    assert.equal(hslSaturation(128, 128, 128), 0)
  })
})

describe('PNG 디코더 — 8bit RGB/RGBA · 필터 5종 · 미지원 형식 거부', () => {
  const W = 17, H = 11 // 홀수 크기: 밴드 경계 floor 검증
  const px = (x, y) => [(x * 13 + y * 7) & 255, (x * 3 + y * 29) & 255, (x * 41 + y * 5) & 255]

  test('필터 0~4 를 섞은 RGB 가 원본 픽셀과 일치한다', () => {
    const png = encodePng(W, H, px, { filterOf: (y) => y % 5 })
    const img = decodePng(png)
    assert.equal(img.channels, 3)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3
      assert.deepEqual([img.data[p], img.data[p + 1], img.data[p + 2]], px(x, y), `(${x},${y})`)
    }
  })
  test('RGBA 도 디코딩되고 알파는 별도 집계된다', () => {
    const png = encodePng(W, H, (x, y) => [...px(x, y), y === 0 ? 200 : 255], { channels: 4, filterOf: (y) => 4 })
    const img = decodePng(png)
    assert.equal(img.channels, 4)
    const r = measure(png)
    assert.equal(r.alphaBelow255, W)
    assert.equal(r.channels, 4)
  })
  test('16bit · palette · interlace 는 명확한 에러', () => {
    assert.throws(() => decodePng(encodePng(4, 4, px, { bitDepth: 16 })), /bitDepth 16/)
    assert.throws(() => decodePng(encodePng(4, 4, px, { colorType: 3 })), /colorType 3/)
    assert.throws(() => decodePng(encodePng(4, 4, px, { interlace: 1 })), /interlaced/)
    assert.throws(() => decodePng(Buffer.from('not png')), /signature/)
  })
})

describe('측정 — 2색 fixture 에서 기대값과 정확히 일치', () => {
  // 상단 3밴드(9행) 청회색 #798CA3(§6-1 밴드0), 하단 5밴드(15행) 올리브 #4A4325(목표 이미지 근경 통합색). 밴드당 3행.
  const W = 20, H = 24
  const TOP = hex('#798CA3'), BOT = hex('#4A4325')
  const png = encodePng(W, H, (x, y) => (y < 9 ? TOP : BOT), { filterOf: (y) => (y * 3) % 5 })
  const targets = JSON.parse(readFileSync(TARGETS, 'utf8'))
  const r = measure(png, { targets, targetsPath: 'targets' })

  test('밴드 경계 floor(i*H/8) · 8밴드', () => {
    assert.equal(r.bands.length, 8)
    assert.deepEqual(r.bands.map((b) => [b.y0, b.y1]), [[0, 3], [3, 6], [6, 9], [9, 12], [12, 15], [15, 18], [18, 21], [21, 24]])
  })
  test('단색 밴드의 채도·hue·luma 는 그 색의 HSL/luma 와 같다', () => {
    const t = rgbToHsl(...TOP), b = rgbToHsl(...BOT)
    for (const band of r.bands.slice(0, 3)) {
      assert.equal(band.hex, '#798CA3')
      assert.equal(band.saturationPct, Math.round(t.s * 1000) / 10)
      assert.equal(band.hueDeg, Math.round(t.h * 10) / 10)
      assert.equal(band.luma, Math.round(luma709(...TOP) * 10) / 10)
    }
    for (const band of r.bands.slice(3)) {
      assert.equal(band.hex, '#4A4325')
      assert.equal(band.saturationPct, Math.round(b.s * 1000) / 10)
      assert.equal(band.hueDeg, Math.round(b.h * 10) / 10)
      assert.equal(band.luma, Math.round(luma709(...BOT) * 10) / 10)
    }
    assert.equal(r.bands[7].saturationPct, 33.3)
    assert.equal(r.bands[7].hueDeg, 48.6)
    assert.equal(r.bands[7].luma, 66.3)
  })
  test('전역 채도 중앙값 = 픽셀 S 정렬의 중앙(다수인 하단색)', () => {
    const all = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) all.push(hslSaturation(...(y < 9 ? TOP : BOT)))
    assert.equal(r.global.saturationMedianPct, Math.round(median(all) * 1000) / 10)
    assert.equal(r.global.saturationMedianPct, 33.3)
  })
  test('near=[6,7]·far=[2] 영역과 L1~L5 판정 구조', () => {
    assert.deepEqual(r.regions.near.bands, [6, 7])
    assert.deepEqual(r.regions.far.bands, [2])
    assert.equal(r.regions.far.hex, '#798CA3')
    assert.equal(r.regions.near.hex, '#4A4325')
    // L1: near 33.3(30~36 ✓) far 18.6(8~12 ✗) → FAIL. L2: near 48.6(45~55 ✓) far 212.6(205~215 ✓) → PASS.
    // L3: far 138.4(130~145 ✓) near 66.3(60~75 ✓) → PASS. L5: 33.3 > 22 → FAIL.
    assert.equal(r.checks.L1.near.pass, true)
    assert.equal(r.checks.L1.far.pass, false)
    assert.equal(r.checks.L1.pass, false)
    assert.equal(r.checks.L2.pass, true)
    assert.equal(r.checks.L3.pass, true)
    assert.equal(r.checks.L4.manual, true)
    assert.equal(r.checks.L4.pass, null)
    assert.equal(r.checks.L5.pass, false)
    assert.deepEqual(r.summary, { autoJudged: 4, passCount: 2, failCount: 2, manual: ['L4'] })
  })
  test('targets 없이 호출하면 checks/summary 는 null', () => {
    const q = measure(png)
    assert.equal(q.checks, null)
    assert.equal(q.summary, null)
    assert.equal(q.schema, 'lookdev-measure/1')
  })
})

describe('측정 — 그라디언트 fixture (청회색→올리브) 를 공식으로 독립 재계산', () => {
  const W = 32, H = 40
  const TOP = hex('#798CA3'), BOT = hex('#473E24')
  const px = (x, y) => { const t = y / (H - 1); return TOP.map((c, i) => Math.round(c + (BOT[i] - c) * t)) }
  const png = encodePng(W, H, px, { channels: 4, filterOf: (y) => (y + 1) % 5 })
  test('밴드별 채도 평균·평균색 hue·luma 와 전역 중앙값이 독립 계산과 일치', () => {
    const r = measure(png)
    const all = []
    for (let bi = 0; bi < 8; bi++) {
      const y0 = Math.floor((bi * H) / 8), y1 = Math.floor(((bi + 1) * H) / 8)
      let sr = 0, sg = 0, sb = 0, ss = 0, n = 0
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const [R, G, B] = px(x, y); sr += R; sg += G; sb += B; ss += hslSaturation(R, G, B); n++; all.push(hslSaturation(R, G, B))
      }
      const band = r.bands[bi]
      assert.equal(band.saturationPct, Math.round((ss / n) * 1000) / 10, `band ${bi} S`)
      assert.equal(band.hueDeg, Math.round(rgbToHsl(sr / n, sg / n, sb / n).h * 10) / 10, `band ${bi} H`)
      assert.equal(band.luma, Math.round(luma709(sr / n, sg / n, sb / n) * 10) / 10, `band ${bi} Y`)
    }
    assert.equal(r.global.saturationMedianPct, Math.round(median(all) * 1000) / 10)
    // 구조적 신호: 위에서 아래로 채도↑, 휘도↓, hue 한랭→온난
    assert.ok(r.bands[7].saturationPct > r.bands[0].saturationPct)
    assert.ok(r.bands[7].luma < r.bands[0].luma)
    assert.ok(r.bands[0].hueDeg > 180 && r.bands[7].hueDeg < 90)
  })
})

describe('CLI — exit code · --out · 스키마', () => {
  test('정상: exit 0, stdout 과 --out 이 같은 JSON, 스키마 키 존재', () => {
    const dir = mkdtempSync(join(tmpdir(), 'measure-test-'))
    try {
      const png = encodePng(16, 16, (x, y) => [100 + y * 5, 110, 120 - y * 3])
      const src = join(dir, 'fx.png'), out = join(dir, 'fx.json')
      writeFileSync(src, png)
      const stdout = execFileSync(process.execPath, [MEASURE, src, '--targets', TARGETS, '--out', out], { cwd: ROOT, encoding: 'utf8' })
      const a = JSON.parse(stdout), b = JSON.parse(readFileSync(out, 'utf8'))
      assert.deepEqual(a, b)
      for (const k of ['schema', 'file', 'sha256', 'width', 'height', 'channels', 'alphaBelow255', 'targets', 'bands', 'global', 'regions', 'checks', 'summary', 'definitions'])
        assert.ok(k in a, `key ${k}`)
      assert.equal(a.width, 16)
      assert.equal(a.sha256.length, 64)
      assert.deepEqual(Object.keys(a.checks), ['L1', 'L2', 'L3', 'L4', 'L5'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  test('오류: 인자 없음 → exit 2, PNG 아님 → exit 2 + 메시지', () => {
    assert.throws(() => execFileSync(process.execPath, [MEASURE], { cwd: ROOT, stdio: 'pipe' }), (e) => e.status === 2)
    assert.throws(
      () => execFileSync(process.execPath, [MEASURE, join(ROOT, 'package.json')], { cwd: ROOT, stdio: 'pipe' }),
      (e) => e.status === 2 && String(e.stderr).includes('not a PNG'),
    )
  })
})
