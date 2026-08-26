#!/usr/bin/env node

/**
 * M4-07 glTF batch optimization wrapper.
 *
 * Execution prerequisite (M4-06, master approval required):
 *   npm i -D @gltf-transform/cli@4.4.2
 *
 * Do not run before M4-06 is complete. The pinned CLI package must exist in
 * node_modules; this script never downloads packages and never invokes npx.
 * glTF Transform 4.4.2 `optimize` applies dedup, weld, and prune. The explicit
 * `--compress draco` option performs the planned quantization/geometry
 * compression. `--texture-compress webp --texture-size 1024` is the §5-3
 * fallback while KTX-Software/toktx is unavailable. No unplanned quantization
 * precision is invented here; the pinned CLI defaults remain authoritative.
 *
 * Usage:
 *   node Automation/optimize-assets.mjs --out Docs/perf/m4-mesh-compression.csv
 */

import { mkdir, readFile, rename, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const EXPECTED_CLI_VERSION = '4.4.2'
const INPUT_DIR = 'DCC/exports'
const OUTPUT_DIR = 'public/models'
const REQUIRED_TRANSFORMS = ['dedup', 'prune', 'weld', 'quantize:draco']
const OPTIMIZE_OPTIONS = [
  '--compress',
  'draco',
  '--texture-compress',
  'webp',
  '--texture-size',
  '1024',
]

const outArg = parseArgs(process.argv.slice(2))
const cwd = process.cwd()
const inputRoot = resolve(cwd, INPUT_DIR)
const outputRoot = resolve(cwd, OUTPUT_DIR)
const reportPath = resolve(cwd, outArg)
const cli = await resolvePinnedCli(cwd)
const inputs = (await readdir(inputRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.glb')
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, 'en'))

if (inputs.length === 0) fail(`no GLB inputs found in ${INPUT_DIR}`)

await mkdir(outputRoot, { recursive: true })
const rows = []

for (const name of inputs) {
  const inputPath = resolve(inputRoot, name)
  const outputPath = resolve(outputRoot, name)
  const temporaryPath = resolve(outputRoot, `.${name}.${process.pid}.optimizing.glb`)
  const before = await glbStats(inputPath)

  try {
    const result = spawnSync(
      process.execPath,
      [cli.entry, 'optimize', inputPath, temporaryPath, ...OPTIMIZE_OPTIONS],
      { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )

    if (result.error) throw result.error
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      throw new Error(`gltf-transform exited ${result.status}${detail ? `\n${detail}` : ''}`)
    }

    const after = await glbStats(temporaryPath)
    await replaceFile(temporaryPath, outputPath)

    rows.push({
      input: repoPath(cwd, inputPath),
      output: repoPath(cwd, outputPath),
      before_bytes: before.bytes,
      after_bytes: after.bytes,
      before_tris: before.triangles,
      after_tris: after.triangles,
    })
  } catch (error) {
    await rm(temporaryPath, { force: true })
    fail(`${name}: ${error.message}`)
  }
}

await mkdir(dirname(reportPath), { recursive: true })
await writeFile(reportPath, toCsv(rows), 'utf8')
process.stdout.write(
  `optimized=${rows.length} report=${repoPath(cwd, reportPath)} cli=${cli.version} transforms=${REQUIRED_TRANSFORMS.join('+')}\n`,
)

function parseArgs(args) {
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) {
    process.stderr.write('usage: node Automation/optimize-assets.mjs --out <path>\n')
    process.exit(2)
  }
  return args[1]
}

async function resolvePinnedCli(root) {
  const packageRoot = resolve(root, 'node_modules/@gltf-transform/cli')
  const packageJsonPath = resolve(packageRoot, 'package.json')
  let metadata
  try {
    metadata = JSON.parse(await readFile(packageJsonPath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') fail(`M4-06 incomplete: missing ${repoPath(root, packageJsonPath)}`)
    throw error
  }

  if (metadata.version !== EXPECTED_CLI_VERSION) {
    fail(`expected @gltf-transform/cli ${EXPECTED_CLI_VERSION}, found ${metadata.version ?? 'unknown'}`)
  }

  const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.['gltf-transform']
  if (!bin) fail('pinned CLI package has no gltf-transform bin entry')
  return { version: metadata.version, entry: resolve(packageRoot, bin) }
}

async function glbStats(path) {
  const bytes = (await stat(path)).size
  const buffer = await readFile(path)
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`${path} is not a binary glTF file`)
  }
  if (buffer.readUInt32LE(4) !== 2) throw new Error(`${path} is not glTF 2.0`)

  let offset = 12
  let json
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    const end = start + chunkLength
    if (end > buffer.length) throw new Error(`${path} has a truncated GLB chunk`)
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(buffer.toString('utf8', start, end).replace(/\0+$/u, '').trim())
      break
    }
    offset = end
  }
  if (!json) throw new Error(`${path} has no JSON chunk`)

  let triangles = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const accessorIndex = primitive.indices ?? primitive.attributes?.POSITION
      const count = json.accessors?.[accessorIndex]?.count
      if (!Number.isFinite(count)) continue
      const mode = primitive.mode ?? 4
      if (mode === 4) triangles += Math.floor(count / 3)
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2)
    }
  }
  return { bytes, triangles }
}

function toCsv(rows) {
  const fields = ['input', 'output', 'before_bytes', 'after_bytes', 'before_tris', 'after_tris']
  return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => csvCell(row[field])).join(',')).join('\n')}\n`
}

function csvCell(value) {
  const text = String(value)
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function repoPath(root, path) {
  return relative(root, path).replaceAll('\\', '/')
}

async function replaceFile(temporaryPath, outputPath) {
  const backupPath = `${outputPath}.${process.pid}.backup`
  let hasBackup = false
  await rm(backupPath, { force: true })

  try {
    await rename(outputPath, backupPath)
    hasBackup = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  try {
    await rename(temporaryPath, outputPath)
  } catch (error) {
    if (hasBackup) await rename(backupPath, outputPath)
    throw error
  }
  if (hasBackup) await rm(backupPath, { force: true })
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}
