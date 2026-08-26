import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'check-ip.mjs')
const csvHeader = 'asset_id,display_name,type,source,source_url,license,license_url,acquired_at,acquired_by,author,attribution_required,redistribution_allowed,ai_training_allowed,dcc_file,export_file,runtime_file,tris_lod0,texture_res,notes\n'

function assetRow(assetId, runtimeFile, notes = '') {
  return [assetId, assetId, 'SM', 'test', 'local:test', 'self', 'none', '2026-08-27', 'test', 'test', 'no', 'yes', 'yes', 'none', 'none', runtimeFile, '0', 'none', notes].join(',')
}

function fixture() {
  const base = mkdtempSync(resolve(tmpdir(), 'check-ip-'))
  const root = resolve(base, 'web3d')
  mkdirSync(resolve(root, 'src/game/data'), { recursive: true })
  mkdirSync(resolve(root, 'src/data'), { recursive: true })
  mkdirSync(resolve(root, 'dist'), { recursive: true })
  mkdirSync(resolve(base, 'asset'), { recursive: true })
  writeFileSync(resolve(root, 'src/game/data/ip-denylist.json'), JSON.stringify({ schema: 'ip-denylist/1', terms: ['Henesys'] }))
  writeFileSync(resolve(root, 'src/data/assets.csv'), csvHeader)
  for (let index = 1; index <= 4; index += 1)
    writeFileSync(resolve(base, 'asset', `reference-${index}.png`), Buffer.from(`reference-${index}`))
  return root
}

function removeFixture(root) {
  rmSync(dirname(root), { recursive: true, force: true })
}

function run(root, args = ['--dist', 'dist']) {
  const proc = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
  const report = JSON.parse(readFileSync(resolve(root, 'Docs/qa/m6-ip-check.json'), 'utf8'))
  return { proc, report }
}

test('dist text containing a denylisted proper name exits 1 with evidence', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'dist/app.js'), 'const town = "Henesys"\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 1)
    assert.equal(report.checks.forbiddenNames.status, 'fail')
    assert.deepEqual(report.checks.forbiddenNames.matches.map((match) => match.term), ['Henesys'])
  } finally {
    removeFixture(root)
  }
})

test('reference image hashes pass when none of the four files is in dist', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'dist/app.js'), 'const town = "original"\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 0)
    assert.equal(report.checks.referenceImageHashes.status, 'pass')
    assert.equal(report.checks.referenceImageHashes.references.length, 4)
  } finally {
    removeFixture(root)
  }
})

test('an exact reference PNG copied into dist exits 1 with its SHA-256', () => {
  const root = fixture()
  try {
    const copied = readFileSync(resolve(dirname(root), 'asset/reference-3.png'))
    writeFileSync(resolve(root, 'dist/copied.png'), copied)
    const { proc, report } = run(root)
    assert.equal(proc.status, 1)
    assert.equal(report.checks.referenceImageHashes.status, 'fail')
    assert.equal(report.checks.referenceImageHashes.matches[0].distFile, 'dist/copied.png')
    assert.match(report.checks.referenceImageHashes.matches[0].sha256, /^[a-f0-9]{64}$/)
  } finally {
    removeFixture(root)
  }
})

test('every dist image and GLB registered by runtime_file passes', () => {
  const root = fixture()
  try {
    mkdirSync(resolve(root, 'dist/models'), { recursive: true })
    writeFileSync(resolve(root, 'dist/models/tree.glb'), Buffer.from('glb'))
    writeFileSync(resolve(root, 'src/data/assets.csv'), csvHeader + assetRow('asset.tree.a', 'public/models/tree.glb') + '\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 0)
    assert.equal(report.checks.registeredAssets.status, 'pass')
    assert.equal(report.checks.registeredAssets.assetFiles.length, 1)
  } finally {
    removeFixture(root)
  }
})

test('an unregistered dist image or GLB exits 1 with its deployment path', () => {
  const root = fixture()
  try {
    mkdirSync(resolve(root, 'dist/models'), { recursive: true })
    writeFileSync(resolve(root, 'dist/models/rogue.glb'), Buffer.from('glb'))
    const { proc, report } = run(root)
    assert.equal(proc.status, 1)
    assert.equal(report.checks.registeredAssets.status, 'fail')
    assert.deepEqual(report.checks.registeredAssets.unregisteredFiles, ['models/rogue.glb'])
  } finally {
    removeFixture(root)
  }
})

test('a .set. ledger row registers every image beside its representative file', () => {
  const root = fixture()
  try {
    mkdirSync(resolve(root, 'dist/ui/items'), { recursive: true })
    writeFileSync(resolve(root, 'dist/ui/items/a.png'), Buffer.from('a'))
    writeFileSync(resolve(root, 'dist/ui/items/b.png'), Buffer.from('b'))
    writeFileSync(resolve(root, 'src/data/assets.csv'), csvHeader + assetRow('asset.ui.icons.set.a', 'public/ui/items/a.png', '2 files') + '\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 0)
    assert.equal(report.checks.registeredAssets.status, 'pass')
    assert.deepEqual(report.checks.registeredAssets.setPrefixes, ['ui/items/'])
  } finally {
    removeFixture(root)
  }
})

test('ASCII denylist terms use token boundaries instead of matching instance', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/game/data/ip-denylist.json'), JSON.stringify({ schema: 'ip-denylist/1', terms: ['Stan'] }))
    writeFileSync(resolve(root, 'dist/app.js'), 'const instanceCount = 3\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 0)
    assert.equal(report.checks.forbiddenNames.status, 'pass')
  } finally {
    removeFixture(root)
  }
})

test('B-01 own-forced source scan excludes the unreachable conti catalog and reports zero residuals', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/game/i18n.ts'), "export const deploymentIpMode = 'own'\n")
    writeFileSync(resolve(root, 'src/game/data/strings.ko.json'), JSON.stringify({ conti: { town: 'Henesys' }, own: { town: 'Mushroom Village' } }))
    writeFileSync(resolve(root, 'src/story.ts'), 'export const ownTown = "Mushroom Village"\n')
    const { proc, report } = run(root, ['--src'])
    assert.equal(proc.status, 0)
    assert.equal(report.result, 'PASS')
    assert.equal(report.checks.forbiddenNames.count, 0)
    assert.equal(report.contiTreeShaking.status, 'excluded')
  } finally {
    removeFixture(root)
  }
})

test('B-01 own-forced scan still fails when the own table contains a denylisted name', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/game/i18n.ts'), "export const IP_MODE_DEFAULT = 'own'\n")
    writeFileSync(resolve(root, 'src/game/data/strings.ko.json'), JSON.stringify({ conti: { town: 'Henesys' }, own: { town: 'Henesys' } }))
    const { proc, report } = run(root, ['--src'])
    assert.equal(proc.status, 1)
    assert.equal(report.checks.ownVisibleStrings.status, 'fail')
  } finally {
    removeFixture(root)
  }
})

test('a conti-mode residual remains a hard FAIL', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/game/i18n.ts'), "export function t(key, ipMode = 'conti') { return key + ipMode }\n")
    writeFileSync(resolve(root, 'src/game/data/strings.ko.json'), JSON.stringify({ conti: { town: 'Henesys' }, own: { town: 'Mushroom Village' } }))
    writeFileSync(resolve(root, 'dist/app.js'), 'const legacy = "Henesys"\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 1)
    assert.equal(report.checks.forbiddenNames.status, 'fail')
    assert.equal(report.ipPolicy.defaultMode, 'conti')
  } finally {
    removeFixture(root)
  }
})

test('conti default mode fails even when the current dist contains no denylisted text', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/game/i18n.ts'), "export function t(key, ipMode = 'conti') { return key + ipMode }\n")
    writeFileSync(resolve(root, 'src/game/data/strings.ko.json'), JSON.stringify({ conti: { town: 'Henesys' }, own: { town: 'Mushroom Village' } }))
    writeFileSync(resolve(root, 'dist/app.js'), 'const town = "Mushroom Village"\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 1)
    assert.equal(report.checks.forbiddenNames.status, 'pass')
    assert.equal(report.contiTreeShaking.status, 'fail')
  } finally {
    removeFixture(root)
  }
})

test('--src scans source text and marks both dist-only checks not-run', () => {
  const root = fixture()
  try {
    writeFileSync(resolve(root, 'src/story.ts'), 'export const town = "Henesys"\n')
    const { proc, report } = run(root, ['--src'])
    assert.equal(proc.status, 1)
    assert.equal(report.mode, 'src')
    assert.equal(report.checks.forbiddenNames.status, 'fail')
    assert.equal(report.checks.referenceImageHashes.status, 'not-run')
    assert.equal(report.checks.registeredAssets.status, 'not-run')
  } finally {
    removeFixture(root)
  }
})

test('missing dist automatically falls back to source-only mode', () => {
  const root = fixture()
  try {
    rmSync(resolve(root, 'dist'), { recursive: true, force: true })
    writeFileSync(resolve(root, 'src/story.ts'), 'export const town = "original"\n')
    const { proc, report } = run(root)
    assert.equal(proc.status, 0)
    assert.equal(report.mode, 'src')
    assert.equal(report.dist.status, 'not-run')
    assert.match(report.dist.reason, /not found/)
  } finally {
    removeFixture(root)
  }
})
