import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readQuest = async () => {
  const quests = JSON.parse(await readFile(join(ROOT, 'src/game/data/quests.json'), 'utf8'))
  return quests['pig-cleanup']
}

test('돼지 퇴치 퀘스트는 10마리와 메소·EXP·리본 보상을 정의한다', async () => {
  const quest = await readQuest()
  assert.equal(quest.target.monsterId, 'pig')
  assert.equal(quest.target.count, 10)
  assert.deepEqual(quest.rewards, {
    meso: 3000,
    exp: 250,
    items: [{ itemId: 'head.pig-ribbon', quantity: 1 }],
  })
})

test('거절은 none을 유지하며 이후 다시 수락할 수 있다', async () => {
  const { acceptQuest, createQuestProgress, declineQuest } = await load('src/game/rules/quest.ts')
  const initial = createQuestProgress('pig-cleanup')
  const declined = declineQuest(initial)

  assert.deepEqual(declined, initial)
  assert.deepEqual(acceptQuest(declined), {
    questId: 'pig-cleanup',
    status: 'active',
    killCount: 0,
  })
})

test('10번째 돼지에서 active→ready, 11번째에는 변화가 없다', async () => {
  const { acceptQuest, createQuestProgress, recordQuestKill } = await load('src/game/rules/quest.ts')
  const quest = await readQuest()
  let progress = acceptQuest(createQuestProgress(quest.id))
  for (let index = 0; index < 9; index += 1) progress = recordQuestKill(progress, quest, 'pig')
  assert.equal(progress.status, 'active')
  assert.equal(progress.killCount, 9)

  progress = recordQuestKill(progress, quest, 'pig')
  assert.equal(progress.status, 'ready')
  const afterEleventh = recordQuestKill(progress, quest, 'pig')
  assert.deepEqual(afterEleventh, progress)
})

test('ready만 보상을 한 번 받고 done이 된다', async () => {
  const { completeQuest } = await load('src/game/rules/quest.ts')
  const quest = await readQuest()
  const ready = { questId: quest.id, status: 'ready', killCount: 10 }
  const completed = completeQuest(ready, quest)

  assert.deepEqual(completed, {
    progress: { ...ready, status: 'done' },
    rewards: quest.rewards,
  })
  assert.equal(completeQuest(completed.progress, quest).rewards, null)
})
