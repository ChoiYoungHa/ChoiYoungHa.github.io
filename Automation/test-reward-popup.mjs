import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('보상 팝업은 콘티의 메소·EXP·리본 3종을 i18n으로 표시한다', async () => {
  const { rewardPopupPresentation } = await load('src/systems/ui/rewardPopupLogic.ts')
  const view = rewardPopupPresentation('conti', 3, 3)
  assert.equal(view.title, '보상 획득')
  assert.deepEqual(view.rewards.map(({ text }) => text), ['메소 3,000', '경험치 +250', '돼지리본 (장식)'])
  assert.deepEqual(view.rewards.map(({ iconUrl }) => iconUrl), [
    '/ui/items/itm-meso.png',
    '/ui/items/ui-star.png',
    '/ui/items/itm-pigribbon.png',
  ])
})

test('LEVEL UP은 현재 레벨이 이전 레벨보다 높을 때만 보인다', async () => {
  const { rewardPopupPresentation } = await load('src/systems/ui/rewardPopupLogic.ts')
  assert.equal(rewardPopupPresentation('conti', 3, 4).showLevelUp, true)
  assert.equal(rewardPopupPresentation('conti', 4, 4).showLevelUp, false)
  assert.equal(rewardPopupPresentation('conti', 4, 3).showLevelUp, false)
})
