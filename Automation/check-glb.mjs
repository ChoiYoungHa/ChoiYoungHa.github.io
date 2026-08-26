#!/usr/bin/env node

/**
 * Inspect GLB v2 files without loading WebGL or a browser.
 * R76-A output includes triangles, unique skin joints, animations, images, and bytes.
 *
 * Usage:
 *   node Automation/check-glb.mjs --out Docs/qa/m5-char-glb.json public/models/char_player.glb public/models/npc_stan.glb public/models/npc_maya.glb
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function usage() {
  return `Usage: node Automation/check-glb.mjs [--out report.json] <file.glb> [file.glb ...]\n`
}

function parseArgs(argv) {
  const result = { files: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') result.help = true
    else if (token === '--out') {
      index += 1
      if (index >= argv.length) throw new Error('--out requires a path')
      result.out = argv[index]
    } else if (token.startsWith('--')) throw new Error(`Unknown option: ${token}`)
    else result.files.push(token)
  }
  if (!result.help && result.files.length === 0) throw new Error('At least one GLB is required')
  return result
}

function parseGlb(file) {
  const bytes = fs.readFileSync(file)
  if (bytes.toString('utf8', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${file}: not GLB v2`)
  }
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error(`${file}: length header mismatch`)
  const jsonLength = bytes.readUInt32LE(12)
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) throw new Error(`${file}: JSON chunk missing`)
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim())
  const binaryHeader = 20 + jsonLength
  const binaryLength = bytes.readUInt32LE(binaryHeader)
  if (bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942) throw new Error(`${file}: BIN chunk missing`)
  const binary = bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength)
  return { bytes, json, binary }
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (mimeType === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = bytes[offset + 1]
      offset += 2
      if (marker === 0xd8 || marker === 0xd9) continue
      const size = bytes.readUInt16BE(offset)
      if (size < 2 || offset + size > bytes.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) }
      }
      offset += size
    }
  }
  return { width: null, height: null }
}

function componentReader(componentType) {
  if (componentType === 5120) return { bytes: 1, read: (buffer, offset) => buffer.readInt8(offset) }
  if (componentType === 5121) return { bytes: 1, read: (buffer, offset) => buffer.readUInt8(offset) }
  if (componentType === 5122) return { bytes: 2, read: (buffer, offset) => buffer.readInt16LE(offset) }
  if (componentType === 5123) return { bytes: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) }
  if (componentType === 5125) return { bytes: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) }
  if (componentType === 5126) return { bytes: 4, read: (buffer, offset) => buffer.readFloatLE(offset) }
  throw new Error(`Unsupported accessor componentType: ${componentType}`)
}

function accessorRange(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex]
  if (accessor.min?.length && accessor.max?.length) {
    return { min: accessor.min[0], max: accessor.max[0] }
  }
  const view = json.bufferViews[accessor.bufferView]
  const reader = componentReader(accessor.componentType)
  const stride = view.byteStride || reader.bytes
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  let min = Infinity
  let max = -Infinity
  for (let index = 0; index < accessor.count; index += 1) {
    const value = reader.read(binary, start + index * stride)
    min = Math.min(min, value)
    max = Math.max(max, value)
  }
  return { min, max }
}

function triangleCount(json) {
  let triangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = primitive.mode ?? 4
      const count = primitive.indices !== undefined
        ? json.accessors[primitive.indices].count
        : json.accessors[primitive.attributes.POSITION].count
      if (mode === 4) triangles += count / 3
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2)
    }
  }
  return triangles
}

function animationSummary(json, binary) {
  return (json.animations ?? []).map((animation, index) => {
    let min = Infinity
    let max = -Infinity
    for (const sampler of animation.samplers ?? []) {
      const range = accessorRange(json, binary, sampler.input)
      min = Math.min(min, range.min)
      max = Math.max(max, range.max)
    }
    return {
      name: animation.name || `animation-${index}`,
      durationSeconds: Number.isFinite(min) && Number.isFinite(max) ? max - min : 0,
      channels: animation.channels?.length ?? 0,
    }
  })
}

function imageSummary(json, binary) {
  return (json.images ?? []).map((image, index) => {
    if (image.bufferView === undefined) {
      return { name: image.name || `image-${index}`, mimeType: image.mimeType ?? null, uri: image.uri ?? null }
    }
    const view = json.bufferViews[image.bufferView]
    const start = view.byteOffset || 0
    const bytes = binary.subarray(start, start + view.byteLength)
    return {
      name: image.name || `image-${index}`,
      mimeType: image.mimeType ?? null,
      bytes: view.byteLength,
      ...imageDimensions(bytes, image.mimeType),
    }
  })
}

function validateReferences(json, binary) {
  const errors = []
  const inRange = (value, length) => Number.isInteger(value) && value >= 0 && value < length

  ;(json.bufferViews ?? []).forEach((view, index) => {
    const start = view.byteOffset || 0
    if (view.buffer !== 0) errors.push(`bufferViews[${index}].buffer=${view.buffer}, expected 0`)
    if (start < 0 || view.byteLength < 0 || start + view.byteLength > binary.length) {
      errors.push(`bufferViews[${index}] exceeds BIN chunk`)
    }
  })
  ;(json.accessors ?? []).forEach((accessor, index) => {
    if (accessor.bufferView !== undefined && !inRange(accessor.bufferView, json.bufferViews?.length ?? 0)) {
      errors.push(`accessors[${index}].bufferView out of range`)
    }
  })
  ;(json.skins ?? []).forEach((skin, skinIndex) => {
    for (const joint of skin.joints ?? []) {
      if (!inRange(joint, json.nodes?.length ?? 0)) errors.push(`skins[${skinIndex}] joint ${joint} out of range`)
    }
  })
  ;(json.animations ?? []).forEach((animation, animationIndex) => {
    ;(animation.samplers ?? []).forEach((sampler, samplerIndex) => {
      if (!inRange(sampler.input, json.accessors?.length ?? 0)) errors.push(`animations[${animationIndex}].samplers[${samplerIndex}].input out of range`)
      if (!inRange(sampler.output, json.accessors?.length ?? 0)) errors.push(`animations[${animationIndex}].samplers[${samplerIndex}].output out of range`)
    })
    ;(animation.channels ?? []).forEach((channel, channelIndex) => {
      if (!inRange(channel.sampler, animation.samplers?.length ?? 0)) errors.push(`animations[${animationIndex}].channels[${channelIndex}].sampler out of range`)
      if (!inRange(channel.target?.node, json.nodes?.length ?? 0)) errors.push(`animations[${animationIndex}].channels[${channelIndex}].target.node out of range`)
    })
  })
  ;(json.images ?? []).forEach((image, index) => {
    if (image.bufferView !== undefined && !inRange(image.bufferView, json.bufferViews?.length ?? 0)) {
      errors.push(`images[${index}].bufferView out of range`)
    }
  })
  ;(json.textures ?? []).forEach((texture, index) => {
    if (!inRange(texture.source, json.images?.length ?? 0)) errors.push(`textures[${index}].source out of range`)
    if (texture.sampler !== undefined && !inRange(texture.sampler, json.samplers?.length ?? 0)) errors.push(`textures[${index}].sampler out of range`)
  })
  return { valid: errors.length === 0, errors }
}

export function inspectGlb(file) {
  const absolute = path.resolve(file)
  const { bytes, json, binary } = parseGlb(absolute)
  const joints = new Set((json.skins ?? []).flatMap((skin) => skin.joints ?? []))
  const animations = animationSummary(json, binary)
  const images = imageSummary(json, binary)
  const triangles = triangleCount(json)
  const isPlayer = path.basename(absolute).toLowerCase() === 'char_player.glb'
  return {
    file: path.relative(process.cwd(), absolute).replaceAll('\\', '/'),
    bytes: bytes.length,
    triangles,
    bones: joints.size,
    skins: json.skins?.length ?? 0,
    clips: animations.length,
    animations,
    textures: json.textures?.length ?? 0,
    images,
    validation: validateReferences(json, binary),
    constraints: {
      singleFileLe20MiB: bytes.length <= 20 * 1024 * 1024,
      ...(isPlayer ? {
        playerTrianglesLe18K: triangles <= 18_000,
        playerBonesLe45: joints.size <= 45,
        playerClipsEq3: animations.length === 3,
      } : {}),
    },
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generator: 'Automation/check-glb.mjs R76-A',
    files: options.files.map(inspectGlb),
  }
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (options.out) {
    const output = path.resolve(options.out)
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, json)
  }
  process.stdout.write(json)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`[check-glb] ${error.stack || error.message}`)
    process.exitCode = 1
  }
}
