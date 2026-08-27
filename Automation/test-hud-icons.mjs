import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('HUD and gameplay items resolve to the compact project-owned icon set', async () => {
  const { HUD_ICON_URLS } = await load('src/systems/ui/hudLogic.ts')
  const catalog = (await import('../src/game/data/itemIcons.json', { with: { type: 'json' } })).default

  assert.deepEqual(HUD_ICON_URLS, {
    basicAttack: '/ui/icons/wpn-sword-steel.png',
    skill: '/ui/icons/skl-flameslash.png',
    meso: '/ui/icons/itm-meso.png',
  })
  assert.equal(catalog.items['weapon.hunting-bow'], '/ui/icons/wpn-bow-hunting.png')
  assert.equal(catalog.items['head.pig-ribbon'], '/ui/icons/itm-pigribbon.png')

  const urls = new Set([...Object.values(catalog.hud), ...Object.values(catalog.items)])
  let totalBytes = 0
  for (const url of urls) {
    const path = join(ROOT, 'public', url.replace(/^\//u, ''))
    const [bytes, info] = await Promise.all([readFile(path), stat(path)])
    assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG')
    assert.equal(bytes.readUInt32BE(16) <= 128, true, `${url} width`)
    assert.equal(bytes.readUInt32BE(20) <= 128, true, `${url} height`)
    totalBytes += info.size
  }
  assert.equal(totalBytes <= 400_000, true, `icon bytes ${totalBytes}`)
})
