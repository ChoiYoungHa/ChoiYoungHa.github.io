import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'public', 'ui', 'items')
const CATALOG_PATH = join(ROOT, 'src', 'game', 'data', 'icons.json')
const { ICON_CATEGORIES, ICON_COUNT, MAX_TOTAL_BYTES, pngDimensions } = await import(new URL('./import-item-icons.mjs', import.meta.url).href)
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'))
const files = readdirSync(OUTPUT).filter((file) => file.toLowerCase().endsWith('.png')).sort()

const REQUIRED_ITEM_ICONS = {
  'wpn.sword.wooden': 'wpn-sword-wooden.png',
  'wpn.bow.hunting': 'wpn-bow-hunting.png',
  'wpn.staff.oak': 'wpn-staff-oak.png',
  'wpn.dagger.iron': 'wpn-dagger-iron.png',
  'itm.meso': 'itm-meso.png',
  'itm.pigribbon': 'itm-pigribbon.png',
}

describe('M6-06 item icon import', () => {
  test('contains exactly 47 PNG files with valid signatures and 256x256 IHDR', () => {
    assert.equal(files.length, ICON_COUNT)
    for (const file of files) {
      const path = join(OUTPUT, file)
      assert.deepEqual([...readFileSync(path).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], file)
      assert.deepEqual(pngDimensions(path), { width: 256, height: 256 }, file)
    }
  })

  test('stays within the decimal 4MB payload limit', () => {
    const totalBytes = files.reduce((sum, file) => sum + statSync(join(OUTPUT, file)).size, 0)
    assert.equal(totalBytes, catalog.summary.totalBytes)
    assert.ok(totalBytes <= MAX_TOTAL_BYTES, `${totalBytes} > ${MAX_TOTAL_BYTES}`)
  })

  test('catalog registers 47 unique ids, files, and supported categories', () => {
    const icons = Object.values(catalog.icons)
    assert.equal(icons.length, ICON_COUNT)
    assert.equal(new Set(icons.map((icon) => icon.id)).size, ICON_COUNT)
    assert.equal(new Set(icons.map((icon) => icon.file)).size, ICON_COUNT)
    for (const icon of icons) {
      assert.ok(ICON_CATEGORIES.includes(icon.category), JSON.stringify(icon))
      assert.equal(icon.icon, `/ui/items/${icon.file}`)
      assert.equal(existsSync(join(OUTPUT, icon.file)), true, icon.file)
    }
  })

  test('contains the six permanent item ids from game concept section 4-3', () => {
    for (const [id, file] of Object.entries(REQUIRED_ITEM_ICONS)) {
      assert.equal(catalog.icons[id]?.file, file, id)
      assert.equal(existsSync(join(OUTPUT, file)), true, file)
    }
  })

  test('records a core-phase manifest proposal without modifying the manifest', () => {
    assert.equal(catalog.manifestSuggestion.phase, 'core')
    assert.equal(catalog.manifestSuggestion.itemCount, ICON_COUNT)
    assert.equal(catalog.manifestSuggestion.totalBytes, catalog.summary.totalBytes)
    assert.ok(catalog.manifestSuggestion.projectedCoreCumulativeBytes <= 12_000_000)
    assert.match(catalog.manifestSuggestion.note, /proposal only/)
  })
})
