import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const lookdev = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'lookdev.json'), 'utf8'))
const {
  directionalAttenuation,
  directionalHazeMix,
  hazeDirectionLobe,
  hazeDirectionWeight,
  yawDegFromXZ,
} = await import(pathToFileURL(join(ROOT, 'src', 'scene', 'sky', 'hazeDirection.ts')).href)

const config = lookdev.sky.hazeDirection
const S1 = { x: 38 - 18, z: -96 - -60 }
const S3 = { x: 0 - 36.3, z: 8 - -91.3 }
const s1Yaw = yawDegFromXZ(S1.x, S1.z)
const s3Yaw = yawDegFromXZ(S3.x, S3.z)

describe('direction-weighted sky haze', () => {
  test('vista yaw convention and configured bright direction match S3', () => {
    assert.ok(Math.abs(s1Yaw - 150.945) < 0.001)
    assert.ok(Math.abs(s3Yaw - config.brightYawDeg) < 0.01)
  })

  test('S1 is outside the bright half-plane and remains unchanged', () => {
    assert.ok(Math.abs(hazeDirectionWeight(s1Yaw, config.brightYawDeg, config.gain) - 1) <= 0.01)
    assert.equal(directionalAttenuation(s1Yaw, config), 0)
    assert.equal(directionalHazeMix(lookdev.sky.hazeMix, s1Yaw, config), lookdev.sky.hazeMix)
  })

  test('S3 receives the full gain and bounded attenuation', () => {
    assert.ok(Math.abs(hazeDirectionWeight(s3Yaw, config.brightYawDeg, config.gain) - (1 + config.gain)) < 1e-6)
    assert.ok(Math.abs(directionalAttenuation(s3Yaw, config) - config.gain * config.maxAttenuation) < 1e-6)
    assert.ok(directionalAttenuation(s3Yaw, config) <= config.maxAttenuation)
  })

  test('opposite direction receives no gain or attenuation', () => {
    const oppositeYaw = config.brightYawDeg + 180
    assert.equal(hazeDirectionLobe(oppositeYaw, config.brightYawDeg), 0)
    assert.equal(hazeDirectionWeight(oppositeYaw, config.brightYawDeg, config.gain), 1)
    assert.equal(directionalAttenuation(oppositeYaw, config), 0)
  })

  test('cosine lobe is continuous at both half-plane boundaries', () => {
    const epsilon = 1e-6
    for (const boundary of [config.brightYawDeg - 90, config.brightYawDeg + 90]) {
      const left = hazeDirectionLobe(boundary - epsilon, config.brightYawDeg)
      const at = hazeDirectionLobe(boundary, config.brightYawDeg)
      const right = hazeDirectionLobe(boundary + epsilon, config.brightYawDeg)
      assert.ok(Math.abs(left - at) < 1e-7)
      assert.ok(Math.abs(right - at) < 1e-7)
    }
  })
})
