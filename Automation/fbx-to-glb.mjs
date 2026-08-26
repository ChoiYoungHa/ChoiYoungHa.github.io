#!/usr/bin/env node

/**
 * Convert a skinned FBX plus optional animation-only FBX files to one GLB.
 *
 * Examples:
 *   node Automation/fbx-to-glb.mjs --skin ../web3d/DCC/incoming/asset.char.player.a/char_remy_tpose.fbx \
 *     --anim idle=../web3d/DCC/incoming/asset.char.player.a/anim_idle.fbx \
 *     --anim walk=../web3d/DCC/incoming/asset.char.player.a/anim_walk_inplace.fbx \
 *     --anim run=../web3d/DCC/incoming/asset.char.player.a/anim_run_inplace.fbx \
 *     --out public/models/char_player.glb
 *   node Automation/fbx-to-glb.mjs --skin character_with_idle.fbx --base-clip idle --out public/models/npc.glb
 *
 * R76-A: No npm packages are added. FBXLoader gets a minimal image/URL DOM shim
 * that preserves embedded image bytes. GLTFExporter receives texture-free
 * materials, avoiding canvas, and the original compressed images are then
 * attached directly to GLB bufferViews. FileReader is polyfilled for Node.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LoadingManager } from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'specularMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'roughnessMap',
  'metalnessMap',
  'bumpMap',
]
const STANDARD_TEXTURE_SLOTS = new Set(['map', 'normalMap', 'specularMap', 'emissiveMap', 'aoMap'])

function usage() {
  return `Usage:
  node Automation/fbx-to-glb.mjs --skin <with-skin.fbx> [--anim name=file.fbx ...] [--base-clip name] --out <file.glb> [--max-bytes N]

Options:
  --skin <path>       Character FBX containing mesh, skeleton, and skin weights.
  --anim <name=path>  Animation-only FBX; repeat for idle/walk/run.
  --base-clip <name>  Use the first non-empty animation in --skin and rename it.
  --out <path>        Output GLB. R76-A outputs belong under public/models/.
  --max-bytes <N>     Payload cap; default ${DEFAULT_MAX_BYTES} (20 MiB).
  --help              Print this help without reading FBX files.

Texture policy:
  Raw PNG/JPEG bytes are embedded without decoding. If the all-standard-map
  candidate exceeds --max-bytes, specular maps are omitted first, then normal
  maps. Separate alpha/bump maps cannot be merged without a raster canvas and
  are reported as unsupported rather than silently presented as standard glTF.
`
}

export function parseArgs(argv) {
  const out = { animations: [], maxBytes: DEFAULT_MAX_BYTES, help: false }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = () => {
      index += 1
      if (index >= argv.length || argv[index].startsWith('--')) {
        throw new Error(`${token} requires a value`)
      }
      return argv[index]
    }

    if (token === '--help' || token === '-h') out.help = true
    else if (token === '--skin') out.skin = next()
    else if (token === '--out') out.output = next()
    else if (token === '--base-clip') out.baseClip = next()
    else if (token === '--max-bytes') out.maxBytes = Number(next())
    else if (token === '--anim') {
      const value = next()
      const equals = value.indexOf('=')
      if (equals <= 0 || equals === value.length - 1) {
        throw new Error(`--anim must be name=path, received: ${value}`)
      }
      out.animations.push({ name: value.slice(0, equals), file: value.slice(equals + 1) })
    } else {
      throw new Error(`Unknown option: ${token}`)
    }
  }

  if (out.help) return out
  if (!out.skin) throw new Error('--skin is required')
  if (!out.output) throw new Error('--out is required')
  if (!Number.isInteger(out.maxBytes) || out.maxBytes <= 0) {
    throw new Error('--max-bytes must be a positive integer')
  }
  if (!out.baseClip && out.animations.length === 0) {
    throw new Error('Provide --base-clip or at least one --anim name=path')
  }

  const names = [out.baseClip, ...out.animations.map((item) => item.name)].filter(Boolean)
  if (new Set(names).size !== names.length) throw new Error('Clip names must be unique')
  return out
}

class NodeFileReader {
  result = null
  error = null
  onloadend = null

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      (result) => {
        this.result = result
        this.onloadend?.({ target: this })
      },
      (error) => {
        this.error = error
        this.onloadend?.({ target: this })
      },
    )
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then(
      (result) => {
        const type = blob.type || 'application/octet-stream'
        this.result = `data:${type};base64,${Buffer.from(result).toString('base64')}`
        this.onloadend?.({ target: this })
      },
      (error) => {
        this.error = error
        this.onloadend?.({ target: this })
      },
    )
  }
}

const objectUrls = new Map()
let objectUrlSequence = 0

function inferMime(file) {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.bmp') return 'image/bmp'
  if (extension === '.tga') return 'image/tga'
  if (extension === '.tif' || extension === '.tiff') return 'image/tiff'
  return 'application/octet-stream'
}

function imageDimensions(bytes, mimeType) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (mimeType === 'image/jpeg' && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      offset += 2
      if (marker === 0xd8 || marker === 0xd9) continue
      const size = buffer.readUInt16BE(offset)
      if (size < 2 || offset + size > buffer.length) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
      }
      offset += size
    }
  }
  if (mimeType === 'image/bmp' && buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM') {
    return { width: Math.abs(buffer.readInt32LE(18)), height: Math.abs(buffer.readInt32LE(22)) }
  }
  if (mimeType === 'image/webp' && buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
    const kind = buffer.toString('ascii', 12, 16)
    if (kind === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      }
    }
  }
  return { width: 1, height: 1 }
}

async function bytesForImageSource(source) {
  if (objectUrls.has(source)) {
    const blob = objectUrls.get(source)
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'application/octet-stream' }
  }
  if (source.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(source)
    if (!match) throw new Error('Malformed data URI in FBX texture')
    const bytes = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]))
    return { bytes: new Uint8Array(bytes), mimeType: match[1] || 'application/octet-stream' }
  }

  const file = source.startsWith('file:') ? fileURLToPath(source) : source
  const bytes = fs.readFileSync(file)
  return { bytes: new Uint8Array(bytes), mimeType: inferMime(file) }
}

class NodeImage {
  constructor() {
    this.complete = false
    this.width = 1
    this.height = 1
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener))
  }

  dispatch(type, event) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener.call(this, event)
  }

  set src(value) {
    this._src = value
    this.ready = bytesForImageSource(value).then(({ bytes, mimeType }) => {
      this.__bytes = bytes
      this.__mimeType = mimeType
      Object.assign(this, imageDimensions(bytes, mimeType))
      this.complete = true
      this.dispatch('load', { target: this })
    }, (error) => this.dispatch('error', error))
  }

  get src() {
    return this._src
  }
}

function installNodePolyfills() {
  globalThis.window = globalThis
  globalThis.FileReader ??= NodeFileReader
  globalThis.HTMLImageElement ??= NodeImage

  URL.createObjectURL = (blob) => {
    const url = `blob:r76-a:${++objectUrlSequence}`
    objectUrls.set(url, blob)
    return url
  }
  URL.revokeObjectURL = (url) => objectUrls.delete(url)

  globalThis.document ??= {
    createElementNS(_namespace, name) {
      if (name === 'img') return new NodeImage()
      throw new Error(`R76-A Node DOM shim cannot create <${name}>`)
    },
    createElement(name) {
      throw new Error(`R76-A intentionally avoids canvas; attempted to create <${name}>`)
    },
  }
}

function exactArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

async function loadFbx(file) {
  const absolute = path.resolve(file)
  if (!fs.existsSync(absolute)) throw new Error(`FBX does not exist: ${absolute}`)

  const manager = new LoadingManager()
  let itemStarts = 0
  const originalItemStart = manager.itemStart.bind(manager)
  manager.itemStart = (url) => {
    itemStarts += 1
    originalItemStart(url)
  }
  let finish
  let fail
  const loaded = new Promise((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  manager.onLoad = finish
  manager.onError = (url) => fail(new Error(`Failed to load FBX texture: ${url}`))

  const buffer = fs.readFileSync(absolute)
  const root = new FBXLoader(manager).parse(exactArrayBuffer(buffer), `${path.dirname(absolute)}${path.sep}`)
  if (itemStarts > 0) await loaded
  return { root, absolute, bytes: buffer.length, embeddedImageLoads: itemStarts }
}

function firstUsableClip(root, file) {
  const clip = root.animations.find((candidate) => candidate.tracks.length > 0 && candidate.duration > 0)
  if (!clip) throw new Error(`No non-empty AnimationClip found in ${file}`)
  return clip
}

function renamedClip(clip, name) {
  const copy = clip.clone()
  copy.name = name
  copy.optimize()
  copy.resetDuration()
  return copy
}

function collectMaterials(root) {
  const materials = []
  const seen = new Set()
  root.traverse((object) => {
    if (!object.isMesh) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material && !seen.has(material)) {
        seen.add(material)
        materials.push(material)
      }
    }
  })
  return materials
}

function textureTransform(texture) {
  const repeatX = texture.repeat?.x ?? 1
  const repeatY = texture.repeat?.y ?? 1
  const offsetX = texture.offset?.x ?? 0
  const offsetY = texture.offset?.y ?? 0
  const flipY = texture.flipY !== false
  return {
    offset: [offsetX, flipY ? 1 - offsetY : offsetY],
    scale: [repeatX, flipY ? -repeatY : repeatY],
    rotation: texture.rotation || 0,
  }
}

function collectAndDetachTextures(materials) {
  const records = []
  const unsupported = []

  materials.forEach((material, materialIndex) => {
    const marker = `r76-material-${materialIndex}`
    material.userData = { ...material.userData, __r76MaterialId: marker }

    for (const slot of TEXTURE_SLOTS) {
      const texture = material[slot]
      if (!texture?.isTexture) continue
      const image = texture.image
      if (!(image?.__bytes instanceof Uint8Array)) {
        unsupported.push(`${material.name || marker}.${slot}: image bytes unavailable`)
        material[slot] = null
        continue
      }
      const record = {
        marker,
        materialName: material.name || marker,
        slot,
        textureName: texture.name || `${material.name || marker}-${slot}`,
        bytes: Buffer.from(image.__bytes.buffer, image.__bytes.byteOffset, image.__bytes.byteLength),
        mimeType: image.__mimeType || 'application/octet-stream',
        width: image.width || 1,
        height: image.height || 1,
        wrapS: texture.wrapS,
        wrapT: texture.wrapT,
        magFilter: texture.magFilter,
        minFilter: texture.minFilter,
        transform: textureTransform(texture),
      }
      records.push(record)
      if (!STANDARD_TEXTURE_SLOTS.has(slot)) {
        unsupported.push(`${record.materialName}.${slot}: no direct standard glTF mapping; omitted`)
      }
      material[slot] = null
    }
  })
  return { records, unsupported }
}

function parseGlb(input) {
  const buffer = Buffer.from(input)
  if (buffer.toString('utf8', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2) {
    throw new Error('GLTFExporter did not return a GLB v2 payload')
  }
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error('GLB length header mismatch')
  const jsonLength = buffer.readUInt32LE(12)
  if (buffer.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB JSON chunk missing')
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trim())
  const binaryHeader = 20 + jsonLength
  const binaryLength = buffer.readUInt32LE(binaryHeader)
  if (buffer.readUInt32LE(binaryHeader + 4) !== 0x004e4942) throw new Error('GLB BIN chunk missing')
  const binary = buffer.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength)
  return { json, binary }
}

function buildGlb(json, binary) {
  let jsonChunk = Buffer.from(JSON.stringify(json), 'utf8')
  if (jsonChunk.length % 4) jsonChunk = Buffer.concat([jsonChunk, Buffer.alloc(4 - (jsonChunk.length % 4), 0x20)])
  let binaryChunk = Buffer.from(binary)
  if (binaryChunk.length % 4) binaryChunk = Buffer.concat([binaryChunk, Buffer.alloc(4 - (binaryChunk.length % 4))])

  const total = 12 + 8 + jsonChunk.length + 8 + binaryChunk.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonChunk.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  jsonChunk.copy(out, 20)
  const binaryHeader = 20 + jsonChunk.length
  out.writeUInt32LE(binaryChunk.length, binaryHeader)
  out.writeUInt32LE(0x004e4942, binaryHeader + 4)
  binaryChunk.copy(out, binaryHeader + 8)
  return out
}

function gltfWrap(value) {
  if (value === 1000) return 10497
  if (value === 1001) return 33071
  if (value === 1002) return 33648
  return 10497
}

function gltfFilter(value) {
  return new Map([
    [1003, 9728],
    [1004, 9984],
    [1005, 9986],
    [1006, 9729],
    [1007, 9985],
    [1008, 9987],
  ]).get(value)
}

function addExtensionUsed(json, name) {
  json.extensionsUsed ??= []
  if (!json.extensionsUsed.includes(name)) json.extensionsUsed.push(name)
}

function addTextureTransform(json, textureInfo, transform) {
  const isIdentity = transform.offset[0] === 0
    && transform.offset[1] === 0
    && transform.scale[0] === 1
    && transform.scale[1] === 1
    && transform.rotation === 0
  if (isIdentity) return
  textureInfo.extensions ??= {}
  textureInfo.extensions.KHR_texture_transform = {
    offset: transform.offset,
    scale: transform.scale,
    ...(transform.rotation ? { rotation: transform.rotation } : {}),
  }
  addExtensionUsed(json, 'KHR_texture_transform')
}

function attachTexture(json, material, record, textureIndex) {
  const info = { index: textureIndex }
  addTextureTransform(json, info, record.transform)

  if (record.slot === 'map') {
    material.pbrMetallicRoughness ??= { metallicFactor: 0, roughnessFactor: 1 }
    material.pbrMetallicRoughness.baseColorTexture = info
  } else if (record.slot === 'normalMap') {
    material.normalTexture = info
  } else if (record.slot === 'emissiveMap') {
    material.emissiveTexture = info
  } else if (record.slot === 'aoMap') {
    material.occlusionTexture = info
  } else if (record.slot === 'specularMap') {
    material.extensions ??= {}
    material.extensions.KHR_materials_specular ??= {}
    material.extensions.KHR_materials_specular.specularTexture = info
    addExtensionUsed(json, 'KHR_materials_specular')
  }
}

function attachRawTextures(baseGlb, records) {
  const { json, binary } = parseGlb(baseGlb)
  json.bufferViews ??= []
  json.images ??= []
  json.samplers ??= []
  json.textures ??= []

  const materialByMarker = new Map()
  for (const material of json.materials ?? []) {
    const marker = material.extras?.__r76MaterialId
    if (marker) materialByMarker.set(marker, material)
  }

  const parts = [Buffer.from(binary)]
  let byteOffset = binary.length
  const imageByHash = new Map()
  const samplerByKey = new Map()
  const textureByKey = new Map()
  const attached = []

  function align() {
    const padding = (4 - (byteOffset % 4)) % 4
    if (padding) {
      parts.push(Buffer.alloc(padding))
      byteOffset += padding
    }
  }

  for (const record of records) {
    const material = materialByMarker.get(record.marker)
    if (!material) throw new Error(`Exported material marker missing: ${record.marker}`)

    const hash = crypto.createHash('sha256').update(record.bytes).digest('hex')
    let imageIndex = imageByHash.get(hash)
    if (imageIndex === undefined) {
      align()
      const bufferView = json.bufferViews.push({
        buffer: 0,
        byteOffset,
        byteLength: record.bytes.length,
      }) - 1
      parts.push(record.bytes)
      byteOffset += record.bytes.length
      imageIndex = json.images.push({
        bufferView,
        mimeType: record.mimeType,
        name: record.textureName,
        extras: { width: record.width, height: record.height, sha256: hash },
      }) - 1
      imageByHash.set(hash, imageIndex)
    }

    const samplerKey = JSON.stringify([record.wrapS, record.wrapT, record.magFilter, record.minFilter])
    let samplerIndex = samplerByKey.get(samplerKey)
    if (samplerIndex === undefined) {
      const sampler = {
        wrapS: gltfWrap(record.wrapS),
        wrapT: gltfWrap(record.wrapT),
      }
      const magFilter = gltfFilter(record.magFilter)
      const minFilter = gltfFilter(record.minFilter)
      if (magFilter) sampler.magFilter = magFilter
      if (minFilter) sampler.minFilter = minFilter
      samplerIndex = json.samplers.push(sampler) - 1
      samplerByKey.set(samplerKey, samplerIndex)
    }

    const textureKey = `${imageIndex}:${samplerIndex}`
    let textureIndex = textureByKey.get(textureKey)
    if (textureIndex === undefined) {
      textureIndex = json.textures.push({ source: imageIndex, sampler: samplerIndex }) - 1
      textureByKey.set(textureKey, textureIndex)
    }
    attachTexture(json, material, record, textureIndex)
    attached.push({ material: record.materialName, slot: record.slot, image: record.textureName, bytes: record.bytes.length })
  }

  for (const material of json.materials ?? []) {
    if (material.extras?.__r76MaterialId) {
      delete material.extras.__r76MaterialId
      if (Object.keys(material.extras).length === 0) delete material.extras
    }
  }

  align()
  const combined = Buffer.concat(parts, byteOffset)
  json.buffers ??= [{}]
  json.buffers[0].byteLength = combined.length
  return { glb: buildGlb(json, combined), attached }
}

function clipSummary(clips) {
  return clips.map((clip) => ({ name: clip.name, duration: clip.duration, tracks: clip.tracks.length }))
}

function objectSummary(root) {
  let triangles = 0
  let bones = 0
  let meshes = 0
  root.traverse((object) => {
    if (object.isBone) bones += 1
    if (!object.isMesh) return
    meshes += 1
    const geometry = object.geometry
    triangles += (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3
  })
  return { meshes, triangles, bones }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }

  installNodePolyfills()
  const skin = await loadFbx(options.skin)
  const clips = []
  const sources = [{ kind: 'skin', file: skin.absolute, bytes: skin.bytes, imageLoads: skin.embeddedImageLoads }]

  if (options.baseClip) clips.push(renamedClip(firstUsableClip(skin.root, skin.absolute), options.baseClip))
  for (const animation of options.animations) {
    const loaded = await loadFbx(animation.file)
    clips.push(renamedClip(firstUsableClip(loaded.root, loaded.absolute), animation.name))
    sources.push({ kind: 'animation', name: animation.name, file: loaded.absolute, bytes: loaded.bytes })
  }

  const materials = collectMaterials(skin.root)
  const { records, unsupported } = collectAndDetachTextures(materials)
  const baseGlb = Buffer.from(await new GLTFExporter().parseAsync(skin.root, {
    binary: true,
    animations: clips,
    onlyVisible: false,
    trs: true,
  }))

  const supported = records.filter((record) => STANDARD_TEXTURE_SLOTS.has(record.slot))
  const policies = [
    { name: 'all-standard', records: supported },
    { name: 'no-specular', records: supported.filter((record) => record.slot !== 'specularMap') },
    { name: 'diffuse-only', records: supported.filter((record) => record.slot === 'map') },
  ]
  const attempts = []
  let selected
  for (const policy of policies) {
    const result = attachRawTextures(baseGlb, policy.records)
    attempts.push({ policy: policy.name, bytes: result.glb.length, attached: result.attached.length })
    selected = { ...policy, ...result }
    if (result.glb.length <= options.maxBytes) break
  }

  const output = path.resolve(options.output)
  const allowedRoot = path.resolve('public/models')
  if (output !== allowedRoot && !output.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error(`R76-A output must stay under ${allowedRoot}: ${output}`)
  }
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, selected.glb)

  const omittedSupported = supported.filter((record) => !selected.records.includes(record))
    .map((record) => `${record.materialName}.${record.slot}`)
  const summary = {
    output,
    bytes: selected.glb.length,
    maxBytes: options.maxBytes,
    withinByteLimit: selected.glb.length <= options.maxBytes,
    texturePolicy: selected.name,
    attempts,
    attachedTextures: selected.attached,
    omittedSupportedTextures: omittedSupported,
    unsupportedTextures: unsupported,
    source: sources,
    object: objectSummary(skin.root),
    clips: clipSummary(clips),
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[fbx-to-glb] ${error.stack || error.message}`)
    process.exitCode = 1
  })
}

