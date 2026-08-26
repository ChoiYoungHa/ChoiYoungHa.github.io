// R75-C — 룩 개선 A안 자산 레지스트리·4경로 분기·placeholder 스캔 테스트 (three 비의존).
import { describe, test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relative) => import(pathToFileURL(join(ROOT, relative)).href)
const look = await load('src/systems/lookAssets.ts')
const scanner = await load('Automation/look-assets.mjs')
const grassLite = await load('src/scene/foliage/grassLiteGeometry.ts')
const { LOOK_ASSET_CONTRACT: C, HOUSE_KEYS } = look

// ---- placeholder 생성기(코드로 만든 64×64 체크 + 알파 원) ----
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
/** RGBA PNG. pixel(x,y) → [r,g,b,a] */
export function makePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y)
      raw.set([r, g, b, a], y * (width * 4 + 1) + 1 + x * 4)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
const checker = (x, y) => (((x >> 3) + (y >> 3)) & 1 ? [200, 190, 160, 255] : [90, 85, 70, 255])
const alphaCircle = (x, y) => (Math.hypot(x - 32, y - 32) < 24 ? [120, 140, 80, 255] : [0, 0, 0, 0])
/** 스캐너는 stat 만 보므로 GLB 는 magic 헤더만 있는 최소 파일이면 된다. */
const glbStub = () => Buffer.concat([Buffer.from('glTF', 'ascii'), Buffer.from([2, 0, 0, 0, 12, 0, 0, 0])])

function writeAt(root, url, bytes) {
  const p = join(root, 'public', url)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, bytes)
}

const tmpRoots = []
const makeRoot = () => { const r = mkdtempSync(join(tmpdir(), 'look-assets-')); tmpRoots.push(r); mkdirSync(join(r, 'public'), { recursive: true }); return r }
after(() => { for (const r of tmpRoots) rmSync(r, { recursive: true, force: true }) })

describe('자산 파일명 계약', () => {
  test('계약 경로는 전부 배포 루트 기준 /models·/textures 이고 중복이 없다', () => {
    const urls = [C.heroTree.glb, ...Object.values(C.village.houses), C.grass.card, ...Object.values(C.terrain)]
    assert.equal(urls.length, 9)
    assert.equal(new Set(urls).size, urls.length)
    for (const u of urls) assert.match(u, /^\/(models|textures)\/[a-z0-9_]+\.(glb|png|jpg)$/, u)
    assert.deepEqual(HOUSE_KEYS, ['house-a', 'house-b', 'house-c'])
  })
})

describe('resolveLookAssets — 4경로 분기', () => {
  const empty = () => look.emptyLookAssetRegistry('test')
  const full = () => {
    const r = empty()
    const a = r.assets
    a.heroTreeGlb = { url: C.heroTree.glb, bytes: 10 }
    for (const k of HOUSE_KEYS) a.houseGlb[k] = { url: C.village.houses[k], bytes: 10 }
    a.grassCard = { url: C.grass.card, bytes: 10 }
    a.terrainGrassDiffuse = { url: C.terrain.grassDiffuse, bytes: 10 }
    a.terrainGrassNormal = { url: C.terrain.grassNormal, bytes: 10 }
    a.terrainDirtDiffuse = { url: C.terrain.dirtDiffuse, bytes: 10 }
    a.terrainDirtNormal = { url: C.terrain.dirtNormal, bytes: 10 }
    return r
  }

  test('자산 0 → 전부 폴백(procedural·vertex·flat)', () => {
    const r = look.resolveLookAssets(empty())
    assert.equal(r.heroTree.mode, 'procedural')
    for (const k of HOUSE_KEYS) assert.equal(r.village[k].mode, 'procedural')
    assert.equal(r.grass.mode, 'vertex')
    assert.equal(r.terrain.mode, 'flat')
  })

  test('자산 전부 → gltf·texture·pbr(+normal)', () => {
    const r = look.resolveLookAssets(full())
    assert.deepEqual(r.heroTree, { mode: 'gltf', url: '/models/hero_tree.glb' })
    for (const k of HOUSE_KEYS) assert.deepEqual(r.village[k], { mode: 'gltf', url: C.village.houses[k] })
    assert.deepEqual(r.grass, { mode: 'texture', url: '/textures/grass_card.png' })
    assert.equal(r.terrain.mode, 'pbr')
    assert.equal(r.terrain.grassNormal, C.terrain.grassNormal)
    assert.equal(r.terrain.dirtNormal, C.terrain.dirtNormal)
  })

  test('부분 존재: 집은 종별 혼합, 지형은 diffuse 쌍 필수·normal 은 쌍일 때만', () => {
    const r1 = full(); r1.assets.houseGlb['house-a'] = { url: null, bytes: 0 }; r1.assets.terrainDirtNormal = { url: null, bytes: 0 }
    const a = look.resolveLookAssets(r1)
    assert.equal(a.village['house-a'].mode, 'procedural')
    assert.equal(a.village['house-b'].mode, 'gltf')
    assert.equal(a.terrain.mode, 'pbr')
    assert.equal(a.terrain.grassNormal, null, 'normal 하나만 있으면 둘 다 무시')
    assert.equal(a.terrain.dirtNormal, null)

    const r2 = full(); r2.assets.terrainGrassDiffuse = { url: null, bytes: 0 }
    assert.equal(look.resolveLookAssets(r2).terrain.mode, 'flat', 'diffuse 하나 없으면 flat')
  })

  test('?lookAssets=0 은 자산이 있어도 전부 폴백, 다른 값은 레지스트리대로', () => {
    assert.equal(look.readForceProcedural('?lookAssets=0'), true)
    assert.equal(look.readForceProcedural('?lookAssets=1'), false)
    assert.equal(look.readForceProcedural(''), false)
    const r = look.resolveLookAssets(full(), true)
    assert.equal(r.heroTree.mode, 'procedural')
    assert.equal(r.terrain.mode, 'flat')
    assert.equal(r.grass.mode, 'vertex')
    assert.equal(r.village['house-c'].mode, 'procedural')
  })

  test('빈 url 문자열은 부재로 본다', () => {
    const r = empty(); r.assets.heroTreeGlb = { url: '', bytes: 0 }
    assert.equal(look.resolveLookAssets(r).heroTree.mode, 'procedural')
  })
})

describe('GLB 메시 분류·정규화', () => {
  test('잎/줄기 분류는 메시·재질 이름의 leaf|leaves|foliage|canopy', () => {
    assert.equal(look.classifyHeroMesh('Leaves_01', 'Mat'), 'leaf')
    assert.equal(look.classifyHeroMesh('mesh_3', 'foliage_alpha'), 'leaf')
    assert.equal(look.classifyHeroMesh('Trunk', 'bark'), 'bark')
    assert.equal(look.classifyHeroMesh('', ''), 'bark')
  })
  test('갓/지붕 분류는 메시 이름의 cap|roof', () => {
    assert.equal(look.classifyHouseMesh('Roof'), 'cap')
    assert.equal(look.classifyHouseMesh('mushroom_cap'), 'cap')
    assert.equal(look.classifyHouseMesh('Wall'), 'body')
  })
  test('fitHeroTransform: 높이 48m 정규화·밑동 y=0', () => {
    const t = look.fitHeroTransform({ minY: -1, maxY: 11 }, 48)
    assert.equal(t.scale, 4)
    assert.equal(t.offsetY, 4)
    assert.equal(-1 * t.scale + t.offsetY, 0, '밑동이 0')
    assert.equal(11 * t.scale + t.offsetY, 48, '꼭대기가 48')
    assert.deepEqual(look.fitHeroTransform({ minY: 0, maxY: 0 }, 48), { scale: 1, offsetY: 0 }, '높이 0 은 항등')
  })
})

describe('지형 길 마스크 pathBlendMask', () => {
  test('길 폭 안 1 · feather 밖 0 · 사이 단조 감소(smoothstep)', () => {
    const w = 3, f = 2.5
    assert.equal(look.pathBlendMask(0, w, f), 1)
    assert.equal(look.pathBlendMask(1.5, w, f), 1)
    assert.equal(look.pathBlendMask(4, w, f), 0)
    assert.equal(look.pathBlendMask(100, w, f), 0)
    let prev = 1
    for (let d = 1.5; d <= 4.0001; d += 0.1) {
      const m = look.pathBlendMask(d, w, f)
      assert.ok(m <= prev + 1e-12 && m >= 0 && m <= 1, `d=${d} m=${m}`)
      prev = m
    }
    assert.ok(Math.abs(look.pathBlendMask(2.75, w, f) - 0.5) < 1e-9, '중간점 0.5')
  })
})

describe('grassLite UV(카드 텍스처 계약)', () => {
  test('정점마다 uv 2개, u·v ∈ [0,1], y=0 정점은 v=0·꼭대기 정점은 v=1', () => {
    const g = grassLite.buildGrassLiteGeometry()
    assert.equal(g.uvs.length, (g.positions.length / 3) * 2)
    for (let i = 0; i < g.positions.length / 3; i++) {
      const y = g.positions[i * 3 + 1], v = g.uvs[i * 2 + 1], u = g.uvs[i * 2]
      assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1)
      if (y === 0) assert.equal(v, 0)
      else assert.equal(v, 1)
    }
    assert.equal(g.triangleCount, 12, '카드 UV 추가로 tris 불변')
  })
})

describe('스캐너 look-assets.mjs (placeholder 텍스처·GLB)', () => {
  test('빈 public → 전부 null, 제안 0', async () => {
    const root = makeRoot()
    const r = await scanner.scanLookAssets(root, 'tmp')
    assert.equal(r.assets.heroTreeGlb.url, null)
    assert.equal(scanner.manifestSuggestions(r).length, 0)
    assert.equal(look.resolveLookAssets(r).terrain.mode, 'flat')
  })

  test('placeholder 9개 배치 → 전부 present·bytes>0·4경로 전부 적용 분기', async () => {
    const root = makeRoot()
    writeAt(root, C.grass.card, makePng(64, 64, alphaCircle))
    writeAt(root, C.terrain.grassDiffuse, makePng(64, 64, checker))
    writeAt(root, C.terrain.dirtDiffuse, makePng(64, 64, checker))
    writeAt(root, C.terrain.grassNormal, makePng(64, 64, () => [128, 128, 255, 255]))
    writeAt(root, C.terrain.dirtNormal, makePng(64, 64, () => [128, 128, 255, 255]))
    writeAt(root, C.heroTree.glb, glbStub())
    for (const k of HOUSE_KEYS) writeAt(root, C.village.houses[k], glbStub())
    const png = readFileSync(join(root, 'public', C.grass.card))
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'placeholder 는 진짜 PNG')

    const r = await scanner.scanLookAssets(root, 'tmp')
    for (const e of [r.assets.heroTreeGlb, r.assets.grassCard, r.assets.terrainGrassDiffuse, r.assets.terrainDirtNormal, ...Object.values(r.assets.houseGlb)]) {
      assert.ok(e.url && e.bytes > 0, JSON.stringify(e))
    }
    const resolved = look.resolveLookAssets(r)
    assert.equal(resolved.heroTree.mode, 'gltf')
    assert.equal(resolved.grass.mode, 'texture')
    assert.equal(resolved.terrain.mode, 'pbr')
    for (const k of HOUSE_KEYS) assert.equal(resolved.village[k].mode, 'gltf')
    const suggestions = scanner.manifestSuggestions(r)
    assert.equal(suggestions.length, 9)
    assert.ok(suggestions.every((s) => s.url.startsWith('public/') && s.bytes > 0 && ['core', 'detail'].includes(s.phase)))
  })

  test('0바이트 파일은 부재로 본다', async () => {
    const root = makeRoot()
    writeAt(root, C.heroTree.glb, Buffer.alloc(0))
    const r = await scanner.scanLookAssets(root, 'tmp')
    assert.equal(r.assets.heroTreeGlb.url, null)
  })

  test('커밋된 src/data/look-assets.json 은 현재 public/ 스캔 결과와 같다(빌드 전 재생성 계약)', async () => {
    const committed = JSON.parse(readFileSync(join(ROOT, 'src/data/look-assets.json'), 'utf8'))
    const fresh = await scanner.scanLookAssets(ROOT, committed.generatedFromHead)
    assert.deepEqual(committed, fresh)
  })

  test('parseLookAssetsArgs', () => {
    const a = scanner.parseLookAssetsArgs(['--root', 'x', '--head', 'abc', '--print'])
    assert.equal(a.head, 'abc'); assert.equal(a.print, true); assert.ok(a.out.endsWith(join('src', 'data', 'look-assets.json')))
    assert.throws(() => scanner.parseLookAssetsArgs(['--bogus']))
  })
})
