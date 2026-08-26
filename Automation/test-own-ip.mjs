import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))
const stringValues = (value) => typeof value === 'string'
  ? [value]
  : Array.isArray(value)
    ? value.flatMap(stringValues)
    : value && typeof value === 'object'
      ? Object.values(value).flatMap(stringValues)
      : []

test('B-01 own 모드의 문자열 표·캐릭터·상점·인벤토리 렌더 문자열에는 고유명이 0건이다', async () => {
  const [{ getStrings }, { characterCreatePresentation }, { shopPanelPresentation }, { inventoryPanelPresentation }, inventory, items, denylist] = await Promise.all([
    load('src/game/i18n.ts'),
    load('src/systems/ui/characterCreateLogic.ts'),
    load('src/systems/ui/shopPanelLogic.ts'),
    load('src/systems/ui/inventoryPanelLogic.ts'),
    load('src/game/rules/inventory.ts'),
    readJson('src/game/data/items.json'),
    readJson('src/game/data/ip-denylist.json'),
  ])
  const bow = items.find(({ id }) => id === 'weapon.hunting-bow')
  const ribbon = items.find(({ id }) => id === 'head.pig-ribbon')
  let bag = inventory.addInventoryItem(inventory.createInventory(), bow, 1).inventory
  bag = inventory.addInventoryItem(bag, ribbon, 1).inventory
  const visible = [
    ...Object.values(getStrings('own')),
    ...stringValues(characterCreatePresentation('영하', 'mage', 'own')),
    ...stringValues(shopPanelPresentation({ jobId: 'archer', meso: 1500, inventory: inventory.createInventory() }, 'weapon.hunting-bow', 'own')),
    ...stringValues(inventoryPanelPresentation(bag, 1, {}, 0, 'own')),
  ].join('\n')
  assert.deepEqual(denylist.terms.filter((term) => visible.toLocaleLowerCase().includes(term.toLocaleLowerCase())), [])
})
