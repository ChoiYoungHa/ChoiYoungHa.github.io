import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

function pngDimensions(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF')
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP')
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.toString('ascii', offset, offset + 4)
    const length = buffer.readUInt32LE(offset + 4)
    const data = offset + 8
    if (type === 'VP8 ') {
      assert.deepEqual([...buffer.subarray(data + 3, data + 6)], [0x9d, 0x01, 0x2a])
      return [buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff]
    }
    if (type === 'VP8X') {
      return [1 + buffer.readUIntLE(data + 4, 3), 1 + buffer.readUIntLE(data + 7, 3)]
    }
    offset = data + length + (length % 2)
  }
  throw new Error('unsupported WebP bitstream')
}

test('R120 portraits, frames and title use the approved dimensions and title budget', async () => {
  for (const name of ['player-warrior', 'stan', 'maya']) {
    const png = await readFile(join(ROOT, `public/ui/portraits/${name}.png`))
    assert.deepEqual(pngDimensions(png), [256, 256])
  }
  for (const name of ['panel-frame', 'button-frame']) {
    const png = await readFile(join(ROOT, `public/ui/frame/${name}.png`))
    assert.deepEqual(pngDimensions(png), [96, 96])
  }
  const title = await readFile(join(ROOT, 'public/ui/title-keyart.webp'))
  assert.equal(title.length <= 300_000, true, `${title.length} bytes exceeds 300 KB`)
  assert.deepEqual(webpDimensions(title), [1280, 720])
})

test('R120 UI wiring keeps the SVG fallback and maps the three approved placements', async () => {
  const portrait = await readFile(join(ROOT, 'src/systems/ui/Portrait.tsx'), 'utf8')
  const characterCreate = await readFile(join(ROOT, 'src/systems/ui/CharacterCreate.tsx'), 'utf8')
  const overlay = await readFile(join(ROOT, 'src/systems/ui/GameOverlay.tsx'), 'utf8')
  const dialogue = await readFile(join(ROOT, 'src/systems/ui/DialoguePanel.tsx'), 'utf8')
  const reward = await readFile(join(ROOT, 'src/systems/ui/RewardPopup.tsx'), 'utf8')
  const shop = await readFile(join(ROOT, 'src/systems/ui/ShopPanel.tsx'), 'utf8')
  const tokens = await readFile(join(ROOT, 'src/systems/ui/hudTokens.ts'), 'utf8')

  assert.match(portrait, /composePortrait\(selection\)/u)
  assert.match(characterCreate, /\/ui\/portraits\/player-warrior\.png/u)
  assert.match(overlay, /\/ui\/title-keyart\.webp/u)
  assert.match(overlay, /\/ui\/portraits\/stan\.png/u)
  assert.match(overlay, /\/ui\/portraits\/maya\.png/u)
  assert.match(overlay, /aria-label="플레이어 초상"/u)
  assert.match(tokens, /panel-frame\.png/u)
  assert.match(tokens, /button-frame\.png/u)
  for (const source of [dialogue, reward, shop]) assert.match(source, /HUD_TOKENS\.borderImage\.panel/u)
})

test('R120 derived sets and title are registered in the asset ledger', async () => {
  const assets = await readFile(join(ROOT, 'src/data/assets.csv'), 'utf8')
  for (const assetId of [
    'asset.fx.atlas.a',
    'asset.ui.portraits.set.a',
    'asset.ui.title.keyart.a',
    'asset.ui.frames.set.a',
  ]) assert.match(assets, new RegExp(`^${assetId.replaceAll('.', '\\.')},`, 'mu'))
})
