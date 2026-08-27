import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('headless session driver completes the authored story deterministically', async () => {
  const { runStory } = await load('Automation/run-story.mjs')
  const first = runStory()
  const second = runStory()
  assert.deepEqual(second, first)
  assert.equal(first.finalState.meso, 4_685)
  assert.equal(first.finalState.level, 4)
  assert.equal(first.finalState.questStatus, 'done')
  assert.equal(first.finalState.questKillCount, 10)
  assert.equal(first.kills, 10)
  assert.equal(first.gameTimeSeconds, 102.391)
  assert.ok(first.gameTimeSeconds <= 15 * 60)
  assert.equal(first.eventOrderViolations, 0)
  assert.ok(first.distanceMeters > 0)
  assert.equal(first.movementSpeedMetersPerSecond, 3.2)
})

test('saved headless story evidence matches the deterministic run', async () => {
  const { runStory } = await load('Automation/run-story.mjs')
  const saved = JSON.parse(await readFile(join(ROOT, 'Docs/qa/m6-story-run-headless.json'), 'utf8'))
  assert.deepEqual(saved, runStory())
})

test('I-10 retry는 완료 run의 모든 mutable 세션 상태를 새 title run으로 초기화한다', async () => {
  const { runStory } = await load('Automation/run-story.mjs')
  const retried = runStory({ epilogueAction: 'retry' })
  assert.deepEqual(retried.finalState, {
    scene: 'title', meso: 1500, level: 1, exp: 0,
    questStatus: 'none', questKillCount: 0, hp: 0, mp: 0,
  })
  assert.deepEqual(retried.resetRuntime, {
    purchased: false, drops: 0, zone: null, activeDialogue: null,
    tutorialEvents: 0, acquiredItems: 0, spawnerDeaths: 0,
    nowMs: 0, latestEventSequence: 0,
  })
})
