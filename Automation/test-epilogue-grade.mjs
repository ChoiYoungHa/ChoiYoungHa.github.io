import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { epilogueExposureAt, EPILOGUE_WARM_EXPOSURE_MULTIPLIER } = await import(
  pathToFileURL(join(ROOT, 'src/game/epilogueGrade.ts')).href
)

test('에필로그 exposure는 재질 추가 없이 2초 동안 warm 목표로 보간한다', () => {
  const base = 0.44
  assert.equal(EPILOGUE_WARM_EXPOSURE_MULTIPLIER, 1.12)
  assert.equal(epilogueExposureAt(0, base), base)
  assert.ok(Math.abs(epilogueExposureAt(1_000, base) - 0.4664) < 1e-12)
  assert.ok(Math.abs(epilogueExposureAt(2_000, base) - 0.4928) < 1e-12)
  assert.equal(epilogueExposureAt(8_000, base), epilogueExposureAt(2_000, base))
})
