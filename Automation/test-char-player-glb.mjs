// char_player.glb 계약(2026-08-27, Higgsfield/Meshy 리깅본 채택): 클립 6·스킨 1·본 24·크기 ≤9MB·삼각형 ≤19K.
// (이전 R118 Draco 최적화본·Mixamo 원본 비교 테스트는 캐릭터 교체로 폐기)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const GLB = path.join(ROOT, 'public/models/char_player.glb')

function summary(file) {
  const buf = readFileSync(file)
  const jsonLength = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  const acc = json.accessors
  const triangles = json.meshes.flatMap((m) => m.primitives).reduce((sum, p) => sum + (p.indices === undefined ? 0 : acc[p.indices].count / 3), 0)
  return {
    bytes: buf.length,
    triangles,
    skins: (json.skins ?? []).length,
    joints: json.skins?.[0]?.joints.length ?? 0,
    clips: (json.animations ?? []).map((a) => a.name).sort(),
    extensions: json.extensionsUsed ?? [],
  }
}

test('char_player.glb: 6 clips · 1 skin · 24 joints · size/tri budget · no compression extensions', () => {
  const s = summary(GLB)
  assert.deepEqual(s.clips, ['attack', 'idle', 'jump', 'run', 'skill', 'walk'])
  assert.equal(s.skins, 1)
  assert.equal(s.joints, 24)
  assert.ok(s.bytes <= 9_000_000, `bytes ${s.bytes} > 9,000,000`)
  assert.ok(s.triangles <= 19_000, `triangles ${s.triangles} > 19,000`)
  for (const ext of s.extensions) assert.ok(!/draco|meshopt/i.test(ext), `unsupported compression ${ext}`)
  process.stdout.write(`${JSON.stringify(s)}\n`)
})
