import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (relativePath) => import(pathToFileURL(join(ROOT, relativePath)).href)

test('결정론 완주 시뮬이 콘티 §9-3의 최종 수치를 재현한다', async () => {
  const { runStorySimulation } = await load('Automation/run-story-sim.mjs')
  const first = runStorySimulation()
  const second = runStorySimulation()
  assert.deepEqual(second, first)

  assert.equal(first.seed, 45)
  assert.equal(first.kills, 10)
  assert.equal(first.dropMeso, 185)
  assert.equal(first.ribbonDrops, 1)
  assert.equal(first.finalMeso, 3785)
  assert.equal(first.level, 4)
  assert.equal(first.questStatus, 'done')
  assert.equal(first.deathCount, 0)
  assert.ok(first.simulatedSeconds <= 15 * 60)
})

test('궁수 스킬은 쿨다운·MP 계약을 지키고 스포너·전투·습득을 실제 통과한다', async () => {
  const { runStorySimulation } = await load('Automation/run-story-sim.mjs')
  const result = runStorySimulation()

  assert.ok(result.skillCastTimesSeconds.length > 0)
  assert.ok(result.skillCastTimesSeconds.length <= 5)
  for (let index = 1; index < result.skillCastTimesSeconds.length; index += 1) {
    assert.ok(result.skillCastTimesSeconds[index] - result.skillCastTimesSeconds[index - 1] >= 3.5)
  }
  assert.equal(result.finalSkillMp, 80 - result.skillCastTimesSeconds.length * 15)
  assert.ok(result.combatHits >= 10)
  assert.ok(result.pickups >= 10)
  assert.ok(result.spawner.totalSpawned >= 10)
  assert.ok(result.aiSteps > 0)
})

test('씬 경로와 저장된 증거 JSON이 순수 시뮬 결과와 일치한다', async () => {
  const { runStorySimulation } = await load('Automation/run-story-sim.mjs')
  const expected = runStorySimulation()
  const saved = JSON.parse(await readFile(join(ROOT, 'Docs/qa/m6-story-sim.json'), 'utf8'))

  assert.deepEqual(expected.sceneTrace, [
    'title',
    'create',
    'forest',
    'henesys',
    'stan',
    'shop',
    'park',
    'hunt',
    'complete',
    'epilogue',
  ])
  assert.deepEqual(saved, expected)
})
