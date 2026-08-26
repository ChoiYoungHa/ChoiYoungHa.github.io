#!/usr/bin/env node

/**
 * Split a KayKit Medieval Hexagon house's single indexed primitive into
 * `<name>_body` and `<name>_roof` meshes without adding dependencies.
 *
 * R87-A: the source files use one material and one 1024px atlas, so a node or
 * material-name split is impossible.  Roof triangles are identified from the
 * atlas's saturated red roof swatches, then guarded by a normalized Y cutoff
 * to avoid treating a low red prop as roof geometry.
 *
 * Usage:
 *   node Automation/split-glb-roof.mjs [--out-dir public/models] <house.glb> [...]
 */

import fs from 'node:fs'
import path from 'node:path'
import { decodePng } from './measure.mjs'

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function usage() {
  return 'Usage: node Automation/split-glb-roof.mjs [--out-dir <dir>] <house.glb> [house.glb ...]\n'
}

function parseArgs(argv) {
  const result = { outDir: 'public/models', files: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--help' || token === '-h') result.help = true
    else if (token === '--out-dir') {
      result.outDir = argv[++index]
      if (!result.outDir) throw new Error('--out-dir requires a directory')
    } else if (token.startsWith('--')) throw new Error(`Unknown option: ${token}`)
    else result.files.push(token)
  }
  if (!result.help && result.files.length === 0) throw new Error('At least one GLB is required')
  return result
}

function parseGlb(file) {
  const bytes = fs.readFileSync(file)
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${file}: not GLB v2`)
  }
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim())
  const binaryHeader = 20 + jsonLength
  if (bytes.readUInt32LE(binaryHeader + 4) !== 0x004e4942) throw new Error(`${file}: BIN chunk missing`)
  const binaryLength = bytes.readUInt32LE(binaryHeader)
  return { json, binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength) }
}

function componentReader(componentType) {
  if (componentType === 5121) return { bytes: 1, read: (buffer, offset) => buffer.readUInt8(offset) }
  if (componentType === 5123) return { bytes: 2, read: (buffer, offset) => buffer.readUInt16LE(offset) }
  if (componentType === 5125) return { bytes: 4, read: (buffer, offset) => buffer.readUInt32LE(offset) }
  if (componentType === 5126) return { bytes: 4, read: (buffer, offset) => buffer.readFloatLE(offset) }
  throw new Error(`Unsupported componentType ${componentType}`)
}

function accessorValues(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex]
  if (!accessor || accessor.sparse || accessor.bufferView === undefined) {
    throw new Error(`Accessor ${accessorIndex} must be a non-sparse bufferView accessor`)
  }
  const components = COMPONENTS[accessor.type]
  if (!components) throw new Error(`Unsupported accessor type ${accessor.type}`)
  const reader = componentReader(accessor.componentType)
  const view = json.bufferViews[accessor.bufferView]
  const stride = view.byteStride || components * reader.bytes
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
  return Array.from({ length: accessor.count }, (_, index) => {
    const offset = start + index * stride
    if (components === 1) return reader.read(binary, offset)
    return Array.from({ length: components }, (__, component) => reader.read(binary, offset + component * reader.bytes))
  })
}

function embeddedBaseColorPng(json, binary, primitive) {
  const material = json.materials?.[primitive.material]
  const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index
  const imageIndex = textureIndex === undefined ? undefined : json.textures?.[textureIndex]?.source
  const image = imageIndex === undefined ? undefined : json.images?.[imageIndex]
  if (image?.mimeType !== 'image/png' || image.bufferView === undefined) {
    throw new Error('Expected an embedded PNG baseColorTexture')
  }
  const view = json.bufferViews[image.bufferView]
  const start = view.byteOffset || 0
  return decodePng(binary.subarray(start, start + view.byteLength))
}

function wrap01(value) {
  return ((value % 1) + 1) % 1
}

function sampleTexture(image, u, v) {
  const x = Math.min(image.width - 1, Math.floor(wrap01(u) * image.width))
  // glTF UV origin and PNG rows match the KayKit atlas export used here.
  const y = Math.min(image.height - 1, Math.floor(wrap01(v) * image.height))
  const offset = (y * image.width + x) * image.channels
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]]
}

function isRoofRed([red, green, blue]) {
  return red >= 150 && green <= 80 && blue <= 100 && red >= green * 2 && red >= blue * 1.5
}

function encodeIndices(indices, componentType) {
  const reader = componentReader(componentType)
  const output = Buffer.alloc(indices.length * reader.bytes)
  for (let index = 0; index < indices.length; index += 1) {
    if (componentType === 5121) output.writeUInt8(indices[index], index)
    else if (componentType === 5123) output.writeUInt16LE(indices[index], index * 2)
    else if (componentType === 5125) output.writeUInt32LE(indices[index], index * 4)
    else throw new Error(`Index componentType ${componentType} is not supported`)
  }
  return output
}

function pad4(buffer, byte = 0) {
  const padding = (4 - (buffer.length % 4)) % 4
  return padding ? Buffer.concat([buffer, Buffer.alloc(padding, byte)]) : buffer
}

function buildGlb(json, binary) {
  const jsonChunk = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const binaryChunk = pad4(binary)
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binaryChunk.length)
  output.write('glTF', 0, 4, 'ascii')
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(jsonChunk.length, 12)
  output.writeUInt32LE(0x4e4f534a, 16)
  jsonChunk.copy(output, 20)
  const binaryHeader = 20 + jsonChunk.length
  output.writeUInt32LE(binaryChunk.length, binaryHeader)
  output.writeUInt32LE(0x004e4942, binaryHeader + 4)
  binaryChunk.copy(output, binaryHeader + 8)
  return output
}

function appendIndexAccessor(json, chunks, indices, componentType, label) {
  const data = encodeIndices(indices, componentType)
  const offset = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const bufferView = json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target: 34963, name: `${label}_indices` }) - 1
  const accessor = json.accessors.push({
    bufferView,
    componentType,
    count: indices.length,
    type: 'SCALAR',
    min: [Math.min(...indices)],
    max: [Math.max(...indices)],
    name: `${label}_indices`,
  }) - 1
  chunks.push(pad4(data))
  return accessor
}

function splitHouse(file, outDir) {
  const { json, binary } = parseGlb(file)
  if ((json.meshes?.length ?? 0) !== 1 || (json.meshes[0].primitives?.length ?? 0) !== 1) {
    throw new Error(`${file}: R87-A splitter requires exactly one mesh and one primitive`)
  }
  const primitive = json.meshes[0].primitives[0]
  if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) throw new Error(`${file}: indexed TRIANGLES required`)
  if (primitive.attributes.POSITION === undefined || primitive.attributes.TEXCOORD_0 === undefined) {
    throw new Error(`${file}: POSITION and TEXCOORD_0 required`)
  }
  const positions = accessorValues(json, binary, primitive.attributes.POSITION)
  const uvs = accessorValues(json, binary, primitive.attributes.TEXCOORD_0)
  const indices = accessorValues(json, binary, primitive.indices)
  const indexComponentType = json.accessors[primitive.indices].componentType
  const atlas = embeddedBaseColorPng(json, binary, primitive)
  const minY = Math.min(...positions.map((point) => point[1]))
  const maxY = Math.max(...positions.map((point) => point[1]))
  const roofFloor = minY + (maxY - minY) * 0.25
  const bodyIndices = []
  const roofIndices = []
  const roofUvBounds = { min: [Infinity, Infinity], max: [-Infinity, -Infinity] }

  for (let offset = 0; offset < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3)
    const centroidU = triangle.reduce((sum, index) => sum + uvs[index][0], 0) / 3
    const centroidV = triangle.reduce((sum, index) => sum + uvs[index][1], 0) / 3
    const centroidY = triangle.reduce((sum, index) => sum + positions[index][1], 0) / 3
    const roof = centroidY >= roofFloor && isRoofRed(sampleTexture(atlas, centroidU, centroidV))
    ;(roof ? roofIndices : bodyIndices).push(...triangle)
    if (roof) {
      roofUvBounds.min[0] = Math.min(roofUvBounds.min[0], centroidU)
      roofUvBounds.min[1] = Math.min(roofUvBounds.min[1], centroidV)
      roofUvBounds.max[0] = Math.max(roofUvBounds.max[0], centroidU)
      roofUvBounds.max[1] = Math.max(roofUvBounds.max[1], centroidV)
    }
  }
  if (roofIndices.length === 0 || bodyIndices.length === 0) throw new Error(`${file}: split produced an empty roof or body`)

  const sourceName = json.meshes[0].name || path.basename(file, '.glb')
  const chunks = [pad4(binary)]
  const bodyAccessor = appendIndexAccessor(json, chunks, bodyIndices, indexComponentType, `${sourceName}_body`)
  const roofAccessor = appendIndexAccessor(json, chunks, roofIndices, indexComponentType, `${sourceName}_roof`)
  const bodyPrimitive = { ...primitive, indices: bodyAccessor }
  const roofPrimitive = { ...primitive, indices: roofAccessor }
  json.meshes[0] = { ...json.meshes[0], name: `${sourceName}_body`, primitives: [bodyPrimitive] }
  const roofMeshIndex = json.meshes.push({ name: `${sourceName}_roof`, primitives: [roofPrimitive] }) - 1
  const sourceNodeIndex = json.nodes.findIndex((node) => node.mesh === 0)
  if (sourceNodeIndex < 0) throw new Error(`${file}: source mesh node not found`)
  const sourceNode = json.nodes[sourceNodeIndex]
  sourceNode.name = `${sourceName}_body`
  const roofNodeIndex = json.nodes.push({ mesh: roofMeshIndex, name: `${sourceName}_roof` }) - 1
  sourceNode.children = [...(sourceNode.children ?? []), roofNodeIndex]

  const joinedBinary = Buffer.concat(chunks)
  json.buffers[0].byteLength = joinedBinary.length
  const output = path.resolve(outDir, `${path.basename(file, '.glb')}_split.glb`)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, buildGlb(json, joinedBinary))
  return {
    input: path.relative(process.cwd(), path.resolve(file)).replaceAll('\\', '/'),
    output: path.relative(process.cwd(), output).replaceAll('\\', '/'),
    sourceTriangles: indices.length / 3,
    bodyTriangles: bodyIndices.length / 3,
    roofTriangles: roofIndices.length / 3,
    roofFloorY: Number(roofFloor.toFixed(6)),
    roofUvCentroidBounds: {
      min: roofUvBounds.min.map((value) => Number(value.toFixed(6))),
      max: roofUvBounds.max.map((value) => Number(value.toFixed(6))),
    },
    method: 'single primitive -> atlas saturated-red centroid AND normalized Y >= 25%',
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }
  const results = options.files.map((file) => splitHouse(file, options.outDir))
  process.stdout.write(`${JSON.stringify({ schema: 'roof-split/1', results }, null, 2)}\n`)
}

try {
  main()
} catch (error) {
  console.error(`[split-glb-roof] ${error.stack || error.message}`)
  process.exitCode = 1
}
