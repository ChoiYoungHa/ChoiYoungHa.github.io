// R75-C — 룩 개선 A안 자산 스캐너. public/ 의 계약 파일 존재 여부·bytes 를 src/data/look-assets.json 에 적는다.
// 런타임은 이 JSON 만 읽고 분기한다(404 시도 0). 사용: node Automation/look-assets.mjs [--root <dir>] [--out <json>] [--head <sha>]
// 계약(파일명)은 src/systems/lookAssets.ts 의 LOOK_ASSET_CONTRACT 가 단일 원본이다.
import { execFileSync } from 'node:child_process'
import { statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_ROOT = resolve(HERE, '..')

export function parseLookAssetsArgs(argv) {
  const out = { root: DEFAULT_ROOT, out: null, head: null, print: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--root') out.root = resolve(argv[++i])
    else if (a === '--out') out.out = resolve(argv[++i])
    else if (a === '--head') out.head = argv[++i]
    else if (a === '--print') out.print = true
    else throw new Error(`unknown arg: ${a}`)
  }
  if (!out.out) out.out = join(out.root, 'src', 'data', 'look-assets.json')
  return out
}

function entryFor(root, url) {
  try {
    const size = statSync(join(root, 'public', url)).size
    return size > 0 ? { url, bytes: size } : { url: null, bytes: 0 }
  } catch {
    return { url: null, bytes: 0 }
  }
}

/** 순수: root 의 public/ 을 스캔해 레지스트리 객체를 만든다(파일 쓰기 없음). */
export async function scanLookAssets(root, head = 'unknown') {
  // 계약은 이 스크립트가 속한 repo 의 것을 쓴다(테스트가 임시 root 를 넘겨도 계약은 같다).
  const contractModule = await import(pathToFileURL(join(DEFAULT_ROOT, 'src', 'systems', 'lookAssets.ts')).href)
  const c = contractModule.LOOK_ASSET_CONTRACT
  const registry = contractModule.emptyLookAssetRegistry(head)
  registry.assets.heroTreeGlb = entryFor(root, c.heroTree.glb)
  for (const key of contractModule.HOUSE_KEYS) registry.assets.houseGlb[key] = entryFor(root, c.village.houses[key])
  registry.assets.grassCard = entryFor(root, c.grass.card)
  registry.assets.terrainGrassDiffuse = entryFor(root, c.terrain.grassDiffuse)
  registry.assets.terrainGrassNormal = entryFor(root, c.terrain.grassNormal)
  registry.assets.terrainDirtDiffuse = entryFor(root, c.terrain.dirtDiffuse)
  registry.assets.terrainDirtNormal = entryFor(root, c.terrain.dirtNormal)
  return registry
}

/** loading-manifest.json 에 넣을 항목 제안(자산이 있는 것만). 실제 manifest 편집은 master 몫(measuredFromHead 규약). */
export function manifestSuggestions(registry) {
  const a = registry.assets
  const items = []
  const push = (phase, id, e, kind) => { if (e.url) items.push({ phase, id, url: `public${e.url}`, bytes: e.bytes, kind }) }
  push('core', 'core.terrain-grass-diffuse', a.terrainGrassDiffuse, 'texture')
  push('core', 'core.terrain-dirt-diffuse', a.terrainDirtDiffuse, 'texture')
  push('core', 'core.terrain-grass-normal', a.terrainGrassNormal, 'texture')
  push('core', 'core.terrain-dirt-normal', a.terrainDirtNormal, 'texture')
  push('core', 'core.grass-card', a.grassCard, 'texture')
  push('detail', 'detail.hero-tree-glb', a.heroTreeGlb, 'glb')
  for (const key of ['house-a', 'house-b', 'house-c']) push('detail', `detail.${key}-glb`, a.houseGlb[key], 'glb')
  return items
}

function gitHead(root) {
  try { return execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseLookAssetsArgs(process.argv.slice(2))
  const registry = await scanLookAssets(args.root, args.head ?? gitHead(args.root))
  writeFileSync(args.out, `${JSON.stringify(registry, null, 2)}\n`)
  const present = Object.entries(registry.assets).flatMap(([k, v]) => 'url' in v ? [[k, v]] : Object.entries(v).map(([h, e]) => [`${k}.${h}`, e])).filter(([, e]) => e.url)
  const summary = { out: args.out, present: present.map(([k, e]) => `${k}=${e.bytes}B`), manifestSuggestions: manifestSuggestions(registry) }
  process.stdout.write(`${JSON.stringify(summary, null, args.print ? 2 : 0)}\n`)
}
