#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const ICON_COUNT = 47
export const MAX_TOTAL_BYTES = 4_000_000
export const ICON_CATEGORIES = ['wpn', 'arm', 'itm', 'skl', 'ui']

export function pngDimensions(file) {
  const header = readFileSync(file).subarray(0, 24)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (header.length < 24 || signature.some((value, index) => header[index] !== value)) {
    throw new Error(`not a PNG: ${file}`)
  }
  if (header.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`PNG without IHDR: ${file}`)
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}

export function iconIdForFile(file) {
  return basename(file, extname(file)).replaceAll('-', '.')
}

function sourceSet(directory) {
  const files = readdirSync(directory)
    .filter((file) => file.toLowerCase().endsWith('.png'))
    .sort()
    .map((file) => ({ file, path: join(directory, file), bytes: statSync(join(directory, file)).size }))
  return { directory, files, totalBytes: files.reduce((sum, icon) => sum + icon.bytes, 0) }
}

export function chooseSourceSet(assetsRoot, maxBytes = MAX_TOTAL_BYTES) {
  const fit = sourceSet(join(assetsRoot, 'items-fit'))
  const compact = sourceSet(join(assetsRoot, 'items'))
  for (const set of [fit, compact]) {
    if (set.files.length !== ICON_COUNT) throw new Error(`${set.directory}: expected ${ICON_COUNT} PNGs, got ${set.files.length}`)
    for (const icon of set.files) {
      const size = pngDimensions(icon.path)
      if (size.width !== 256 || size.height !== 256) throw new Error(`${icon.path}: expected 256x256, got ${size.width}x${size.height}`)
    }
  }
  if (fit.totalBytes <= maxBytes) return { selected: fit, fit, compact, reason: 'items-fit is within the byte limit' }
  if (compact.totalBytes <= maxBytes) {
    return {
      selected: compact,
      fit,
      compact,
      reason: `items-fit ${fit.totalBytes} bytes exceeds ${maxBytes}; selected items ${compact.totalBytes} bytes`,
    }
  }
  throw new Error(`both icon sets exceed ${maxBytes} bytes: items-fit=${fit.totalBytes}, items=${compact.totalBytes}`)
}

function parseArgs(argv) {
  const options = { root: process.cwd(), sourceRoot: null, outDir: null, catalog: null, maxBytes: MAX_TOTAL_BYTES }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const next = () => {
      const item = argv[++index]
      if (!item) throw new Error(`${value} requires a value`)
      return item
    }
    if (value === '--root') options.root = resolve(next())
    else if (value === '--source-root') options.sourceRoot = resolve(next())
    else if (value === '--out-dir') options.outDir = resolve(next())
    else if (value === '--catalog') options.catalog = resolve(next())
    else if (value === '--max-bytes') options.maxBytes = Number(next())
    else if (value === '--help') options.help = true
    else throw new Error(`unknown option: ${value}`)
  }
  if (!Number.isInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error('--max-bytes must be a positive integer')
  options.sourceRoot ??= resolve(options.root, '..', '게임콘티', 'assets')
  options.outDir ??= resolve(options.root, 'public', 'ui', 'items')
  options.catalog ??= resolve(options.root, 'src', 'game', 'data', 'icons.json')
  return options
}

export function importItemIcons(options) {
  const choice = chooseSourceSet(options.sourceRoot, options.maxBytes)
  mkdirSync(options.outDir, { recursive: true })
  const icons = {}
  for (const source of choice.selected.files) {
    const category = source.file.split('-')[0]
    if (!ICON_CATEGORIES.includes(category)) throw new Error(`${source.file}: unsupported category ${category}`)
    const id = iconIdForFile(source.file)
    if (icons[id]) throw new Error(`duplicate icon id: ${id}`)
    const destination = join(options.outDir, source.file)
    copyFileSync(source.path, destination)
    const bytes = statSync(destination).size
    icons[id] = { id, file: source.file, icon: `/ui/items/${source.file}`, category, bytes }
  }

  let currentCoreCumulativeBytes = null
  try {
    const manifest = JSON.parse(readFileSync(resolve(options.root, 'src/data/loading-manifest.json'), 'utf8'))
    currentCoreCumulativeBytes = manifest.summary?.cumulativeBytes?.core ?? null
  } catch {
    // Manifest suggestion remains valid without a current cumulative snapshot.
  }
  const manifestItems = Object.values(icons).map((icon) => ({
    id: `core.ui-item.${icon.id}`,
    url: `public/ui/items/${icon.file}`,
    bytes: icon.bytes,
    kind: 'png',
  }))
  const catalog = {
    schema: 'item-icons/1',
    generatedAt: new Date().toISOString(),
    source: {
      selectedSet: basename(choice.selected.directory),
      selected: `게임콘티/assets/${basename(choice.selected.directory)}`,
      selectedBytes: choice.selected.totalBytes,
      itemsFitBytes: choice.fit.totalBytes,
      itemsBytes: choice.compact.totalBytes,
      maxBytes: options.maxBytes,
      reason: choice.reason,
      attribution: 'codex image_gen project-owned output',
    },
    icons,
    summary: {
      count: Object.keys(icons).length,
      totalBytes: choice.selected.totalBytes,
      categories: Object.fromEntries(ICON_CATEGORIES.map((category) => [category, Object.values(icons).filter((icon) => icon.category === category).length])),
    },
    manifestSuggestion: {
      phase: 'core',
      itemCount: manifestItems.length,
      totalBytes: choice.selected.totalBytes,
      currentCoreCumulativeBytes,
      projectedCoreCumulativeBytes: currentCoreCumulativeBytes == null ? null : currentCoreCumulativeBytes + choice.selected.totalBytes,
      items: manifestItems,
      note: 'proposal only; loading-manifest.json is not modified by M6-06',
    },
  }
  mkdirSync(resolve(options.catalog, '..'), { recursive: true })
  writeFileSync(options.catalog, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  return catalog
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
      process.stdout.write('usage: node Automation/import-item-icons.mjs [--root <repo>] [--source-root <assets>] [--out-dir <dir>] [--catalog <json>] [--max-bytes <n>]\n')
      process.exit(0)
    }
    process.stdout.write(`${JSON.stringify(importItemIcons(options), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`import-item-icons.mjs: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(2)
  }
}
