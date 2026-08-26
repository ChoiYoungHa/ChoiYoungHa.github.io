import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/**
 * R55-A — lookdev-variants.mjs 의 순수 부분(인자·변형 스키마·캡처 계획·판정·결과표·흑백 PNG) 테스트.
 * 실행: node --test Automation/test-lookdev-variants.mjs   (빌드·서버·크롬 없음)
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const load = (rel) => import(pathToFileURL(join(ROOT, rel)).href)
const V = await load('Automation/lookdev-variants.mjs')
const M = await load('Automation/measure.mjs')
const L4 = await load('Automation/l4-contrast.mjs')

describe('parseArgs', () => {
  test('기본값', () => {
    assert.deepEqual(V.parseArgs([]), { variants: 'default', outDir: 'Docs/lookdev/variants', dryRun: false, skipBuild: false, shots: null, port: 5183, settleMs: 12000, timeoutMs: 60000, help: false })
  })
  test('옵션 파싱', () => {
    const o = V.parseArgs(['--variants', 'x.json', '--out-dir', 'out', '--dry-run', '--skip-build', '--shots', 'S1,S3', '--port', '5190', '--timeout-ms', '90000'])
    assert.equal(o.variants, 'x.json')
    assert.equal(o.outDir, 'out')
    assert.equal(o.dryRun, true)
    assert.equal(o.skipBuild, true)
    assert.deepEqual(o.shots, ['S1', 'S3'])
    assert.equal(o.port, 5190)
    assert.equal(o.timeoutMs, 90000)
  })
  test('오류: 미지 인자·값 누락·잘못된 shot·포트', () => {
    assert.throws(() => V.parseArgs(['--bogus']), /unknown argument/)
    assert.throws(() => V.parseArgs(['--out-dir']), /requires a value/)
    assert.throws(() => V.parseArgs(['--shots', 'S9']), /subset/)
    assert.throws(() => V.parseArgs(['--port', 'abc']), /port/)
    assert.throws(() => V.parseArgs(['--timeout-ms', '0']), /timeoutMs/)
  })
})

describe('변형 스키마', () => {
  test('기본 프리셋 4종 · baseline 포함 · 검증 통과', () => {
    const list = V.loadVariants('default')
    assert.deepEqual(list.map((v) => v.name), ['baseline', 'hazeDir', 'heroContrast', 'vistaPitch'])
    assert.doesNotThrow(() => V.validateVariants(list))
    assert.equal(list[0].query, '')
    assert.equal(list[2].query, 'heroContrast=1&heroTrunk=0.75&heroCanopy=1.1')
    assert.equal(list[3].query, 'vistaPitch=22.1')
  })
  test('loadVariants 는 프리셋 복사본을 준다(호출자가 바꿔도 원본 불변)', () => {
    const a = V.loadVariants('default')
    a[0].name = 'changed'
    assert.equal(V.DEFAULT_VARIANTS[0].name, 'baseline')
  })
  test('오류: baseline 없음 · 중복 이름 · noHero ⊄ shots · 잘못된 target', () => {
    const ok = { name: 'a', query: '', shots: ['S1'] }
    assert.throws(() => V.validateVariants([ok]), /baseline/)
    assert.throws(() => V.validateVariants([{ ...ok, name: 'baseline' }, { ...ok, name: 'baseline' }]), /duplicate/)
    assert.throws(() => V.validateVariants([{ ...ok, name: 'baseline', noHero: ['S2'] }]), /noHero/)
    assert.throws(() => V.validateVariants([{ ...ok, name: 'baseline', targets: [{ metric: 'x', op: '==', value: 1 }] }]), /bad target/)
    assert.throws(() => V.validateVariants([{ ...ok, name: 'bad name' }]), /bad name/)
  })
})

describe('planCaptures', () => {
  test('기본 프리셋 → 13 캡처, 이름·URL 규칙', () => {
    const plan = V.planCaptures(V.loadVariants('default'))
    assert.equal(plan.length, 13)
    const s2n = plan.find((p) => p.name === 'lv-heroContrast-S2-nohero')
    assert.ok(s2n)
    const u = new URL(s2n.url)
    assert.equal(u.searchParams.get('shot'), 'vista-start')
    assert.equal(u.searchParams.get('hideHero'), '1')
    assert.equal(u.searchParams.get('heroContrast'), '1')
    assert.equal(u.searchParams.get('heroTrunk'), '0.75')
    assert.equal(u.searchParams.get('report'), 'lv-heroContrast-S2-nohero')
    assert.equal(u.searchParams.get('q'), 'low')
    assert.equal(u.port, '5183')
  })
  test('--shots 제한·포트', () => {
    const plan = V.planCaptures(V.loadVariants('default'), { shots: ['S3'], port: 5190 })
    assert.deepEqual(plan.map((p) => p.name), ['lv-baseline-S3', 'lv-hazeDir-S3', 'lv-heroContrast-S3'])
    assert.ok(plan.every((p) => p.url.startsWith('http://127.0.0.1:5190/')))
  })
  test('detectSwitches — src 텍스트에 get(\'name\') 이 있어야 지원', () => {
    const src = "q.get('heroContrast') === '1'"
    assert.deepEqual(V.detectSwitches(['heroContrast', 'hazeDir'], src), { heroContrast: true, hazeDir: false })
  })
})

describe('judge (순수 판정)', () => {
  const baseline = { passCount: 8, metrics: { s3: { far: { luma: 166 } }, l4: { trunkCanopyDelta: 5.1, minDelta: 5.1 } } }
  test('합계 유지 + 목표 만족 → ADOPT 후보', () => {
    const r = V.judge(baseline, { supported: true, passCount: 8, metrics: { l4: { trunkCanopyDelta: 12.3, minDelta: 12.3 } }, targets: [{ metric: 'l4.trunkCanopyDelta', op: '>=', value: 10 }, { metric: 'l4.minDelta', op: '>=', value: 10 }] })
    assert.equal(r.verdict, 'ADOPT 후보')
    assert.deepEqual(r.reasons, [])
  })
  test('합계 감소 → REJECT (목표 만족해도)', () => {
    const r = V.judge(baseline, { supported: true, passCount: 7, metrics: { s3: { far: { luma: 140 } } }, targets: [{ metric: 's3.far.luma', op: '<=', value: 145 }] })
    assert.equal(r.verdict, 'REJECT')
    assert.match(r.reasons[0], /7 < baseline 8/)
  })
  test('목표 미달 → REJECT + 수치', () => {
    const r = V.judge(baseline, { supported: true, passCount: 9, metrics: { s3: { far: { luma: 150 } } }, targets: [{ metric: 's3.far.luma', op: '<=', value: 145 }] })
    assert.equal(r.verdict, 'REJECT')
    assert.deepEqual(r.reasons, ['s3.far.luma 150 !<= 145'])
  })
  test('측정값 없음 → REJECT(측정 없음)', () => {
    const r = V.judge(baseline, { supported: true, passCount: 8, metrics: {}, targets: [{ metric: 's1.treeBboxTop', op: '>', value: 0 }] })
    assert.equal(r.verdict, 'REJECT')
    assert.match(r.reasons[0], /측정 없음/)
  })
  test('스위치 미구현 → UNSUPPORTED', () => {
    const r = V.judge(baseline, { supported: false, missing: ['hazeDir'] })
    assert.equal(r.verdict, 'UNSUPPORTED')
    assert.match(r.reasons[0], /hazeDir/)
  })
  test('readMetric 경로', () => {
    assert.equal(V.readMetric(baseline.metrics, 's3.far.luma'), 166)
    assert.equal(V.readMetric(baseline.metrics, 's1.treeBboxTop'), undefined)
  })
  test('autoPassCount 는 summary.passCount 합', () => {
    assert.equal(V.autoPassCount({ S1: { summary: { passCount: 4 } }, S2: { summary: { passCount: 1 } }, S3: null }), 5)
  })
})

describe('HDR 미로드 감지 · 흑백 PNG', () => {
  test('looksUnloaded — 상단 2밴드 > 235 이면 true', () => {
    assert.equal(V.looksUnloaded({ bands: [{ luma: 250 }, { luma: 240 }, { luma: 100 }] }), true)
    assert.equal(V.looksUnloaded({ bands: [{ luma: 134 }, { luma: 130 }, { luma: 100 }] }), false)
  })
  test('toGrayPng → l4-contrast 디코더로 읽히고 값 = Rec.709 luma', () => {
    const w = 4, h = 2
    const data = Buffer.alloc(w * h * 3)
    for (let i = 0; i < w * h; i++) { data[i * 3] = 200; data[i * 3 + 1] = 50 + i; data[i * 3 + 2] = 20 }
    const png = V.toGrayPng({ width: w, height: h, channels: 3, data })
    assert.throws(() => M.decodePng(png), /colorType 0/) // measure.mjs 는 gray 거부 → l4-contrast 디코더 사용 근거
    const g = L4.decodePng(png)
    assert.equal(g.width, w)
    assert.equal(g.height, h)
    assert.equal(g.channels, 3)
    for (let i = 0; i < w * h; i++) {
      const expected = Math.round(M.luma709(200, 50 + i, 20))
      assert.equal(g.data[i * 3], expected)
      assert.equal(g.data[i * 3 + 1], expected)
    }
  })
  test('renderResultMd — 표 행 수·판정 굵게', () => {
    const md = V.renderResultMd([
      { name: 'baseline', verdict: '기준', passCount: 8, metrics: { s3: { far: { luma: 166 } } }, reasons: [] },
      { name: 'heroContrast', verdict: 'ADOPT 후보', passCount: 8, metrics: { l4: { trunkCanopyDelta: 12.3, minDelta: 12.3 } }, reasons: [] },
      { name: 'hazeDir', verdict: 'UNSUPPORTED', passCount: null, metrics: null, reasons: ['쿼리 스위치 미구현: hazeDir'] },
    ])
    const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| 변형'))
    assert.equal(rows.length, 3)
    assert.match(rows[0], /baseline \(기준\)/)
    assert.match(rows[1], /\*\*ADOPT 후보\*\*.*12\.3/)
    assert.match(rows[2], /UNSUPPORTED.*hazeDir/)
  })
})
