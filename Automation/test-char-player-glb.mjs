#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ORIGINAL = path.join(ROOT, 'public/models/char_player.orig.glb')
const OPTIMIZED = path.join(ROOT, 'public/models/char_player.glb')

function parseGlb(file) {
  const bytes = fs.readFileSync(file)
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${file}: GLB magic`)
  assert.equal(bytes.readUInt32LE(4), 2, `${file}: GLB version`)
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${file}: byte length header`)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, `${file}: JSON chunk`)
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim())
  return { bytes, json }
}

function triangleCount(json) {
  let triangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
      const count = json.accessors?.[accessorIndex]?.count ?? 0
      const mode = primitive.mode ?? 4
      if (mode === 4) triangles += Math.floor(count / 3)
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2)
    }
  }
  return triangles
}

function animationSummary(json) {
  return (json.animations ?? []).map((animation, index) => {
    const ranges = (animation.samplers ?? []).map((sampler) => json.accessors?.[sampler.input])
    const starts = ranges.flatMap((accessor) => accessor?.min ?? [])
    const ends = ranges.flatMap((accessor) => accessor?.max ?? [])
    return {
      name: animation.name || `animation-${index}`,
      duration: Math.max(...ends) - Math.min(...starts),
      channels: animation.channels?.length ?? 0,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

function jointNameSet(json) {
  return [...new Set(
    (json.skins ?? [])
      .flatMap((skin) => skin.joints ?? [])
      .map((nodeIndex) => json.nodes?.[nodeIndex]?.name)
      .filter(Boolean),
  )].sort()
}

function summary(file) {
  const { bytes, json } = parseGlb(file)
  const primitives = (json.meshes ?? []).reduce((count, mesh) => count + (mesh.primitives?.length ?? 0), 0)
  return {
    file: path.relative(ROOT, file).replaceAll('\\', '/'),
    bytes: bytes.length,
    triangles: triangleCount(json),
    meshes: json.meshes?.length ?? 0,
    primitives,
    materials: json.materials?.length ?? 0,
    textures: json.textures?.length ?? 0,
    images: json.images?.length ?? 0,
    skins: json.skins?.length ?? 0,
    jointNames: jointNameSet(json),
    animations: animationSummary(json),
    extensionsRequired: json.extensionsRequired ?? [],
  }
}

function main() {
  const original = summary(ORIGINAL)
  const optimized = summary(OPTIMIZED)

  assert.ok(optimized.bytes <= 4_000_000, `bytes ${optimized.bytes} > 4,000,000`)
  assert.ok(optimized.triangles <= 18_000, `triangles ${optimized.triangles} > 18,000`)
  assert.equal(optimized.meshes, 1, `meshes ${optimized.meshes} !== 1`)
  assert.ok(optimized.materials <= 1, `materials ${optimized.materials} > 1`)
  assert.ok(optimized.textures <= 2, `textures ${optimized.textures} > 2`)
  assert.equal(optimized.skins, 1, `skins ${optimized.skins} !== 1`)
  assert.ok(optimized.extensionsRequired.includes('KHR_draco_mesh_compression'), 'Draco compression is required')

  assert.deepEqual(
    optimized.animations.map(({ name }) => name),
    ['idle', 'run', 'walk'],
    'idle/walk/run clips must be preserved',
  )
  assert.deepEqual(optimized.jointNames, original.jointNames, 'joint names must be preserved')
  for (const sourceClip of original.animations) {
    const outputClip = optimized.animations.find(({ name }) => name === sourceClip.name)
    assert.ok(outputClip, `missing clip ${sourceClip.name}`)
    assert.ok(Math.abs(outputClip.duration - sourceClip.duration) <= 1e-5, `${sourceClip.name}: duration changed`)
    assert.equal(outputClip.channels, sourceClip.channels, `${sourceClip.name}: channel count changed`)
  }

  const printable = (value) => ({
    ...value,
    jointNameCount: value.jointNames.length,
    jointNames: undefined,
  })
  process.stdout.write(`${JSON.stringify({ original: printable(original), optimized: printable(optimized) }, null, 2)}\n`)
  process.stdout.write('[test-char-player-glb] PASS\n')
}

try {
  main()
} catch (error) {
  console.error(`[test-char-player-glb] FAIL: ${error.message}`)
  process.exitCode = 1
}
