import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)
const readJson = async (relativePath) => JSON.parse(await readFile(join(ROOT, relativePath), 'utf8'))

async function advanceToChoice(dialogue, state) {
  let next = state
  for (let guard = 0; guard < 20; guard += 1) {
    const view = dialogue.dialogueView(next)
    if (view.choices.length > 0 || next.finished) return next
    next = dialogue.advance(next).state
  }
  throw new Error('dialogue did not reach a choice')
}

async function advanceToEnd(dialogue, state) {
  let next = state
  for (let guard = 0; guard < 20 && !next.finished; guard += 1) {
    next = dialogue.advance(next).state
  }
  assert.equal(next.finished, true)
  return next
}

test('스탄 수락은 quest-accept를 방출하고 수락 후 대사를 끝낸다', async () => {
  const dialogue = await load('src/game/dialogue.ts')
  let state = dialogue.createDialogue('stan', { questStatus: 'none', purchased: false })
  state = await advanceToChoice(dialogue, state)

  const accepted = dialogue.advance(state, 'accept')
  assert.deepEqual(accepted.actions, [{ type: 'quest-accept' }])
  assert.equal(dialogue.dialogueView(accepted.state).lineKey, 's04.accepted.1')
  await advanceToEnd(dialogue, accepted.state)
})

test('스탄 거절 후 재호출하면 첫 대사부터 재수락할 수 있다', async () => {
  const dialogue = await load('src/game/dialogue.ts')
  let rejected = dialogue.createDialogue('stan', { questStatus: 'none', purchased: false })
  rejected = await advanceToChoice(dialogue, rejected)
  const declined = dialogue.advance(rejected, 'decline')
  assert.deepEqual(declined.actions, [])
  assert.equal(dialogue.dialogueView(declined.state).lineKey, 's04.decline')
  await advanceToEnd(dialogue, declined.state)

  let retried = dialogue.createDialogue('stan', { questStatus: 'none', purchased: false })
  assert.equal(dialogue.dialogueView(retried).lineKey, 's04.dialogue.1')
  retried = await advanceToChoice(dialogue, retried)
  assert.deepEqual(dialogue.advance(retried, 'accept').actions, [{ type: 'quest-accept' }])
})

test('재방문과 완료 가능·완료 후 경로는 막다른 노드 없이 끝난다', async () => {
  const dialogue = await load('src/game/dialogue.ts')

  await advanceToEnd(dialogue, dialogue.createDialogue('stan', {
    questStatus: 'active',
    purchased: true,
  }))

  let ready = dialogue.createDialogue('stan', { questStatus: 'ready', purchased: true })
  ready = await advanceToChoice(dialogue, ready)
  const completed = dialogue.advance(ready, 'complete')
  assert.equal(completed.actions.length, 1)
  assert.equal(completed.actions[0].type, 'quest-complete')
  assert.equal(completed.actions[0].quest.id, 'pig-cleanup')
  assert.equal(completed.state.finished, true)

  await advanceToEnd(dialogue, dialogue.createDialogue('stan', {
    questStatus: 'done',
    purchased: true,
  }))
})

test('S02·S04·S05·S07·S09·S10 키가 두 ipMode에 모두 있고 트리는 닫혀 있다', async () => {
  const dialogues = await readJson('src/game/data/dialogues.json')
  const strings = await readJson('src/game/data/strings.ko.json')
  const referencedKeys = new Set()

  for (const tree of Object.values(dialogues)) {
    for (const entry of Object.values(tree.routes)) assert.ok(tree.nodes[entry])
    for (const node of Object.values(tree.nodes)) {
      if (node.speakerKey) referencedKeys.add(node.speakerKey)
      for (const key of node.lines) referencedKeys.add(key)
      for (const choice of node.choices ?? []) {
        referencedKeys.add(choice.labelKey)
        if (choice.next) assert.ok(tree.nodes[choice.next])
      }
      if (node.next) assert.ok(tree.nodes[node.next])
      assert.ok(node.end || node.next || (node.choices?.length ?? 0) > 0)
    }
  }

  for (const mode of ['conti', 'own']) {
    for (const key of referencedKeys) assert.equal(typeof strings[mode][key], 'string', `${mode}:${key}`)
  }
  assert.deepEqual(Object.keys(dialogues).sort(), ['firstKill', 'maya', 's02', 's10', 'stan'])
})
