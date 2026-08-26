#!/usr/bin/env node

/**
 * Inspect GLB v2 files without loading WebGL or a browser.
 * R76-A output includes triangles, unique skin joints, animations, images, and bytes.
 * R87-A adds world-space bounds and tree-shape evidence (crown width, trunk-base
 * radius, and leaf-triangle share) without WebGL or a browser.
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

const COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
}

function accessorValues(json, binary, accessorIndex) {
  const accessor = json.accessors?.[accessorIndex]
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}`)
  if (accessor.sparse) throw new Error(`Sparse accessor ${accessorIndex} is not supported by R87-A shape audit`)
  const components = COMPONENTS[accessor.type]
  if (!components) throw new Error(`Unsupported accessor type: ${accessor.type}`)
  const reader = componentReader(accessor.componentType)
  if (accessor.bufferView === undefined) {
    return Array.from({ length: accessor.count }, () => components === 1 ? 0 : Array(components).fill(0))
  }
  const view = json.bufferViews[accessor.bufferView]
  const packedStride = reader.bytes * components
  const stride = view.byteStride || packedStride
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  const result = []
  for (let index = 0; index < accessor.count; index += 1) {
    const base = start + index * stride
    if (components === 1) result.push(reader.read(binary, base))
    else result.push(Array.from({ length: components }, (_, component) => reader.read(binary, base + component * reader.bytes)))
  }
  return result
}

function identityMatrix() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
}

function multiplyMatrices(a, b) {
  const result = Array(16).fill(0)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      for (let index = 0; index < 4; index += 1) {
        result[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index]
      }
    }
  }
  return result
}

function nodeMatrix(node) {
  if (node.matrix?.length === 16) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const xx = x * x
  const yy = y * y
  const zz = z * z
  const xy = x * y
  const xz = x * z
  const yz = y * z
  const xw = x * w
  const yw = y * w
  const zw = z * w
  return [
    (1 - 2 * (yy + zz)) * sx,
    2 * (xy + zw) * sx,
    2 * (xz - yw) * sx,
    0,
    2 * (xy - zw) * sy,
    (1 - 2 * (xx + zz)) * sy,
    2 * (yz + xw) * sy,
    0,
    2 * (xz + yw) * sz,
    2 * (yz - xw) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ]
}

function transformPoint(matrix, point) {
  const [x, y, z] = point
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

function meshInstances(json) {
  const result = []
  const childNodes = new Set((json.nodes ?? []).flatMap((node) => node.children ?? []))
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? (json.nodes ?? []).map((_, index) => index).filter((index) => !childNodes.has(index))
  const visit = (nodeIndex, parentMatrix) => {
    const node = json.nodes?.[nodeIndex]
    if (!node) return
    const worldMatrix = multiplyMatrices(parentMatrix, nodeMatrix(node))
    if (node.mesh !== undefined) result.push({ meshIndex: node.mesh, nodeIndex, nodeName: node.name ?? '', worldMatrix })
    for (const child of node.children ?? []) visit(child, worldMatrix)
  }
  for (const root of roots) visit(root, identityMatrix())
  if (result.length === 0) {
    for (let meshIndex = 0; meshIndex < (json.meshes?.length ?? 0); meshIndex += 1) {
      result.push({ meshIndex, nodeIndex: null, nodeName: '', worldMatrix: identityMatrix() })
    }
  }
  return result
}

function primitiveTriangleCount(json, primitive) {
  const mode = primitive.mode ?? 4
  const count = primitive.indices !== undefined
    ? json.accessors[primitive.indices].count
    : json.accessors[primitive.attributes.POSITION].count
  if (mode === 4) return Math.floor(count / 3)
  if (mode === 5 || mode === 6) return Math.max(0, count - 2)
  return 0
}

function isLeafPrimitive(json, mesh, primitive, nodeName) {
  const material = primitive.material === undefined ? undefined : json.materials?.[primitive.material]
  const evidence = `${nodeName} ${mesh.name ?? ''} ${material?.name ?? ''}`.toLowerCase()
  const [red = 1, green = 1, blue = 1] = material?.pbrMetallicRoughness?.baseColorFactor ?? []
  const greenDominant = green > red * 1.25 && green > blue * 1.25
  return Boolean(
    /leaf|leaves|leafs|foliage|canopy|crown/u.test(evidence)
      || (material?.alphaMode && material.alphaMode !== 'OPAQUE' && !/bark|trunk|wood/u.test(evidence))
      || (!/bark|trunk|wood/u.test(evidence) && greenDominant),
  )
}

function emptyBounds() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
}

function includePoint(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    bounds.min[axis] = Math.min(bounds.min[axis], point[axis])
    bounds.max[axis] = Math.max(bounds.max[axis], point[axis])
  }
}

function finishBounds(bounds) {
  if (!Number.isFinite(bounds.min[0])) return null
  const size = bounds.max.map((value, axis) => value - bounds.min[axis])
  return {
    min: bounds.min.map(roundMetric),
    max: bounds.max.map(roundMetric),
    size: size.map(roundMetric),
  }
}

function percentile(values, ratio) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))]
}

function median(values) {
  return percentile(values, 0.5)
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : null
}

function geometryAudit(json, binary) {
  const overallBounds = emptyBounds()
  const leafBounds = emptyBounds()
  const trunkPoints = []
  let leafTriangles = 0
  let totalTriangles = 0
  let leafPrimitiveCount = 0
  let primitiveCount = 0
  let vertexColorPrimitiveCount = 0
  let uvPrimitiveCount = 0
  const primitiveSummaries = []

  for (const instance of meshInstances(json)) {
    const mesh = json.meshes?.[instance.meshIndex]
    if (!mesh) continue
    for (let primitiveIndex = 0; primitiveIndex < (mesh.primitives?.length ?? 0); primitiveIndex += 1) {
      const primitive = mesh.primitives[primitiveIndex]
      if (primitive.attributes?.POSITION === undefined) continue
      const positions = accessorValues(json, binary, primitive.attributes.POSITION)
      const rawIndices = primitive.indices === undefined
        ? positions.map((_, index) => index)
        : accessorValues(json, binary, primitive.indices)
      const usedIndices = [...new Set(rawIndices)]
      const leaf = isLeafPrimitive(json, mesh, primitive, instance.nodeName)
      const triangles = primitiveTriangleCount(json, primitive)
      primitiveCount += 1
      totalTriangles += triangles
      if (leaf) {
        leafPrimitiveCount += 1
        leafTriangles += triangles
      }
      if (primitive.attributes.COLOR_0 !== undefined) vertexColorPrimitiveCount += 1
      if (primitive.attributes.TEXCOORD_0 !== undefined) uvPrimitiveCount += 1
      for (const index of usedIndices) {
        const point = transformPoint(instance.worldMatrix, positions[index])
        includePoint(overallBounds, point)
        if (leaf) includePoint(leafBounds, point)
        else trunkPoints.push(point)
      }
      primitiveSummaries.push({
        node: instance.nodeName || null,
        mesh: mesh.name || null,
        primitive: primitiveIndex,
        material: primitive.material === undefined ? null : json.materials?.[primitive.material]?.name ?? null,
        triangles,
        leaf,
        vertexColor: primitive.attributes.COLOR_0 !== undefined,
        uv: primitive.attributes.TEXCOORD_0 !== undefined,
      })
    }
  }

  const bounds = finishBounds(overallBounds)
  const crownBounds = finishBounds(leafBounds)
  const height = bounds?.size[1] ?? null
  const crownWidth = crownBounds ? Math.max(crownBounds.size[0], crownBounds.size[2]) : null
  const baseUpperY = bounds && height !== null ? bounds.min[1] + height * 0.12 : null
  const basePoints = baseUpperY === null ? [] : trunkPoints.filter((point) => point[1] <= baseUpperY)
  const centerX = median(basePoints.map((point) => point[0]))
  const centerZ = median(basePoints.map((point) => point[2]))
  const baseRadius = centerX === null || centerZ === null
    ? null
    : percentile(basePoints.map((point) => Math.hypot(point[0] - centerX, point[2] - centerZ)), 0.9)
  const crownWidthHeightRatio = height && crownWidth !== null ? crownWidth / height : null
  const trunkBaseRadiusHeightRatio = height && baseRadius !== null ? baseRadius / height : null
  const leafTriangleRatio = totalTriangles > 0 ? leafTriangles / totalTriangles : null

  return {
    bounds,
    meshCount: json.meshes?.length ?? 0,
    primitiveCount,
    materialCount: json.materials?.length ?? 0,
    vertexColorPrimitiveCount,
    uvPrimitiveCount,
    primitives: primitiveSummaries,
    treeShape: {
      method: 'R87-A world-space indexed vertices; leaf material/name classifier; trunk bottom 12% slice; radius p90 from median XZ center',
      height: roundMetric(height),
      crownWidth: roundMetric(crownWidth),
      crownWidthHeightRatio: roundMetric(crownWidthHeightRatio),
      trunkBaseRadius: roundMetric(baseRadius),
      trunkBaseRadiusHeightRatio: roundMetric(trunkBaseRadiusHeightRatio),
      baseSliceVertexCount: basePoints.length,
      leafTriangles,
      totalTriangles,
      leafTriangleRatio: roundMetric(leafTriangleRatio),
      leafPrimitiveCount,
      classified: leafPrimitiveCount > 0 && trunkPoints.length > 0,
    },
  }
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
  const geometry = geometryAudit(json, binary)
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
    geometry,
    validation: validateReferences(json, binary),
    constraints: {
      singleFileLe20MiB: bytes.length <= 20 * 1024 * 1024,
      treeTrianglesLe40K: triangles <= 40_000,
      treeFileLe10MiB: bytes.length <= 10 * 1024 * 1024,
      treeCrownWidthHeightGte0_7: geometry.treeShape.crownWidthHeightRatio !== null && geometry.treeShape.crownWidthHeightRatio >= 0.7,
      treeTrunkBaseRadiusHeightGte0_04: geometry.treeShape.trunkBaseRadiusHeightRatio !== null && geometry.treeShape.trunkBaseRadiusHeightRatio >= 0.04,
      treeLeafTriangleRatioGte0_4: geometry.treeShape.leafTriangleRatio !== null && geometry.treeShape.leafTriangleRatio >= 0.4,
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
    generator: 'Automation/check-glb.mjs R76-A + R87-A geometry audit',
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
