import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * R54-A — hero 대비 파라미터(heroContrast) 계약 테스트 + 후보 계산 출력.
 * 실행: node --test Automation/test-hero-contrast.mjs   (GPU·브라우저 없음)
 *
 * ① 기본 off 불변: heroContrastColors(off) 는 DEFAULT_HERO_COLORS 동일 객체, buildHeroTree 정점색·위치가 비트 동일
 * ② HSL L 배율은 hue·S 를 유지한다(수관 68°/24% 규칙)
 * ③ 후보 탐색: 실측 흑백 휘도(Docs/qa/m3-l4-contrast.json 줄기 105.7 / 수관 100.6)에 배율을 걸어
 *    Δ≥10 이 되는 최소 조합을 찾고, 수관 HSL 이 §6-2(S 24%±6pp · L 20%±6pp) 안인지 판정한다.
 *    화면 휘도 예측 모델: 조명은 선형 곱이고 화면은 sRGB 이므로 screen ∝ (L 배율)^(1/2.2) — 보수적(작게) 잡는다.
 *    선형 비례 모델(screen ∝ 배율)도 같이 출력한다. 실제 값은 GATE 후 캡처로만 확정한다.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))

const G = await load('src/scene/hero/heroTreeGeometry.ts')
const lookdev = readJson('src/data/lookdev.json')
const l4 = readJson('Docs/qa/m3-l4-contrast.json')

const MEASURED = { trunk: l4.regions.trunk.luma, canopy: l4.regions.canopy.luma, sky: l4.regions.sky.luma }
const THRESHOLD = 10
const PALETTE = { canopy: { hue: 68, s: 0.24, l: 0.20, tol: 0.06, hueTol: 2 } }

const r3 = (v) => Math.round(v * 1000) / 1000
const pct = (v) => Math.round(v * 1000) / 10

describe('기본 off 불변', () => {
  test('lookdev.heroContrast 는 enabled=false · 배율 1.0', () => {
    assert.equal(lookdev.heroContrast.enabled, false)
    assert.equal(lookdev.heroContrast.trunkLumaScale, 1)
    assert.equal(lookdev.heroContrast.canopyLumaScale, 1)
  })
  test('heroContrastColors(off) === DEFAULT_HERO_COLORS (동일 객체)', () => {
    assert.equal(G.heroContrastColors(lookdev.heroContrast), G.DEFAULT_HERO_COLORS)
    assert.equal(G.heroContrastColors(null), G.DEFAULT_HERO_COLORS)
    assert.equal(G.heroContrastColors({ enabled: false, trunkLumaScale: 0.5, canopyLumaScale: 2 }), G.DEFAULT_HERO_COLORS)
  })
  test('scaleLightness(c, 1) 은 입력 객체 그대로', () => {
    assert.equal(G.scaleLightness(G.TRUNK_COLOR, 1), G.TRUNK_COLOR)
  })
  for (const lod of [0, 1]) {
    test(`buildHeroTree(${lod}) 기본 호출 == colors 명시 호출 (positions·normals·colors 비트 동일)`, () => {
      const a = G.buildHeroTree(lod)
      const b = G.buildHeroTree(lod, undefined, G.heroContrastColors(lookdev.heroContrast))
      assert.deepEqual(Array.from(a.positions), Array.from(b.positions))
      assert.deepEqual(Array.from(a.normals), Array.from(b.normals))
      assert.deepEqual(Array.from(a.colors), Array.from(b.colors))
      assert.equal(a.triangles, b.triangles)
    })
  }
  test('on 이어도 지오메트리(positions·normals·tris)는 불변, colors 만 바뀐다', () => {
    const a = G.buildHeroTree(0)
    const b = G.buildHeroTree(0, undefined, G.heroContrastColors({ enabled: true, trunkLumaScale: 0.85, canopyLumaScale: 1.1 }))
    assert.deepEqual(Array.from(a.positions), Array.from(b.positions))
    assert.deepEqual(Array.from(a.normals), Array.from(b.normals))
    assert.equal(a.triangles, b.triangles)
    assert.notDeepEqual(Array.from(a.colors), Array.from(b.colors))
  })
})

describe('HSL L 배율 — hue·S 유지', () => {
  test('rgb↔hsl 왕복', () => {
    for (const c of [G.TRUNK_COLOR, G.CANOPY_COLOR, { r: 0.2, g: 0.5, b: 0.9 }]) {
      const { h, s, l } = G.rgbToHsl(c)
      const back = G.hslToRgb(h, s, l)
      for (const k of ['r', 'g', 'b']) assert.ok(Math.abs(back[k] - c[k]) < 1e-9, k)
    }
  })
  test('수관 #3B3E26 = 68°/24%/20%(반올림)', () => {
    const { h, s, l } = G.rgbToHsl(G.CANOPY_COLOR)
    assert.equal(Math.round(h), 68)
    assert.equal(Math.round(s * 100), 24)
    assert.equal(Math.round(l * 100), 20)
  })
  test('배율 후 hue·S 는 소수점 이하까지 유지, L 만 배율', () => {
    for (const k of [0.8, 0.9, 1.05, 1.15, 1.3]) {
      for (const base of [G.TRUNK_COLOR, G.CANOPY_COLOR]) {
        const o = G.rgbToHsl(base)
        const n = G.rgbToHsl(G.scaleLightness(base, k))
        assert.ok(Math.abs(n.h - o.h) < 1e-6, `hue k=${k}`)
        assert.ok(Math.abs(n.s - o.s) < 1e-6, `sat k=${k}`)
        assert.ok(Math.abs(n.l - o.l * k) < 1e-9, `L k=${k}`)
      }
    }
  })
})

// ───────── 후보 탐색 ─────────
function predict(scale, model) {
  return model === 'gamma' ? Math.pow(scale, 1 / 2.2) : scale
}
function evaluate(trunkScale, canopyScale) {
  const out = {}
  for (const model of ['gamma', 'linear']) {
    const trunk = MEASURED.trunk * predict(trunkScale, model)
    const canopy = MEASURED.canopy * predict(canopyScale, model)
    out[model] = { trunk: r3(trunk), canopy: r3(canopy), delta: r3(canopy - trunk), deltaTrunkSky: r3(MEASURED.sky - trunk), deltaCanopySky: r3(MEASURED.sky - canopy) }
  }
  const canopyHsl = G.rgbToHsl(G.scaleLightness(G.CANOPY_COLOR, canopyScale))
  const trunkHsl = G.rgbToHsl(G.scaleLightness(G.TRUNK_COLOR, trunkScale))
  const p = PALETTE.canopy
  const paletteOk = Math.abs(canopyHsl.h - p.hue) <= p.hueTol && Math.abs(canopyHsl.s - p.s) <= p.tol && Math.abs(canopyHsl.l - p.l) <= p.tol
  return {
    trunkLumaScale: trunkScale, canopyLumaScale: canopyScale,
    trunkHsl: { h: r3(trunkHsl.h), sPct: pct(trunkHsl.s), lPct: pct(trunkHsl.l) },
    canopyHsl: { h: r3(canopyHsl.h), sPct: pct(canopyHsl.s), lPct: pct(canopyHsl.l) },
    canopyPaletteOk: paletteOk,
    predicted: out,
  }
}

/** 보수적(gamma) 모델에서 Δ≥10 이 되는 최소 조합: 수관 배율을 팔레트 상한(L≤26%)까지만, 나머지는 줄기 어둡게. */
function searchCandidates() {
  const results = []
  for (let canopy = 1.0; canopy <= 1.301; canopy = r3(canopy + 0.05)) {
    for (let trunk = 1.0; trunk >= 0.5; trunk = r3(trunk - 0.05)) {
      const e = evaluate(trunk, canopy)
      if (e.predicted.gamma.delta >= THRESHOLD && e.canopyPaletteOk) {
        results.push(e)
        break // 이 수관 배율에서 가장 약한 줄기 배율(가장 큰 값)만
      }
    }
  }
  return results
}

describe('후보 조합', () => {
  test('실측 입력 확인', () => {
    assert.equal(MEASURED.trunk, 105.7)
    assert.equal(MEASURED.canopy, 100.6)
    assert.equal(MEASURED.sky, 147.4)
  })
  test('현재(1.0/1.0)는 Δ5.1 미달', () => {
    const e = evaluate(1, 1)
    assert.equal(e.predicted.linear.delta, r3(100.6 - 105.7))
    assert.ok(Math.abs(e.predicted.linear.delta) < THRESHOLD)
  })
  test('보수적(gamma) 모델에서 Δ≥10·팔레트 안 조합이 2개 이상 존재', () => {
    const c = searchCandidates()
    assert.ok(c.length >= 2, `found ${c.length}`)
    for (const e of c) {
      assert.ok(e.predicted.gamma.delta >= THRESHOLD)
      assert.ok(e.canopyPaletteOk)
      assert.ok(e.predicted.gamma.deltaTrunkSky >= 20 && e.predicted.gamma.deltaCanopySky >= 20, '하늘 대비 두 체크는 유지')
    }
  })
  test('수관 배율 1.3 초과는 팔레트 L 상한(26%) 이탈', () => {
    assert.equal(evaluate(1, 1.35).canopyPaletteOk, false)
    assert.equal(evaluate(1, 1.3).canopyPaletteOk, true)
  })
  test('후보 계산 출력 (Docs/lookdev/l4-contrast-plan.md 로 옮긴다)', () => {
    const c = searchCandidates()
    const picked = [c[0], c[c.length - 1], evaluate(0.85, 1.05), evaluate(0.8, 1.15)]
    console.log('HERO_CONTRAST_CANDIDATES ' + JSON.stringify({ measured: MEASURED, threshold: THRESHOLD, minimalPerCanopyScale: c, picked }, null, 1))
  })
})
