#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--json')) {
  process.stderr.write('usage: node Automation/check-assets.mjs [--json]\n')
  process.exit(2)
}

const cwd = process.cwd()
const modelsRoot = resolve(cwd, 'public/models')
const assetsPath = resolve(cwd, 'src/data/assets.csv')
const rows = parseCsv(await readFile(assetsPath, 'utf8'))
const [header, ...records] = rows
const assets = records.map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ''])))

const modelFiles = (await walk(modelsRoot))
  .map((path) => repoPath(path))
  .filter((path) => !path.endsWith('/.gitkeep'))
  .sort()
const registeredModels = new Set(
  assets.map((asset) => normalize(asset.runtime_file)).filter((path) => path.startsWith('public/models/')),
)

const unregisteredFiles = modelFiles.filter((path) => !registeredModels.has(path))
const missingRuntimeFiles = []
const emptyLicenseFields = []

for (const asset of assets) {
  const runtimeFile = normalize(asset.runtime_file)
  if (!runtimeFile || runtimeFile === 'none') {
    missingRuntimeFiles.push({ asset_id: asset.asset_id, runtime_file: asset.runtime_file || '' })
  } else if (!(await exists(resolve(cwd, runtimeFile)))) {
    missingRuntimeFiles.push({ asset_id: asset.asset_id, runtime_file: runtimeFile })
  }

  for (const field of ['license', 'license_url']) {
    if (!asset[field]?.trim()) emptyLicenseFields.push({ asset_id: asset.asset_id, field })
  }
}

const pass = unregisteredFiles.length === 0 && missingRuntimeFiles.length === 0 && emptyLicenseFields.length === 0
const result = {
  pass,
  counts: {
    assets: assets.length,
    modelFiles: modelFiles.length,
    registeredModelPaths: registeredModels.size,
  },
  unregisteredFiles,
  missingRuntimeFiles,
  emptyLicenseFields,
}

if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else process.stdout.write(`${pass ? 'PASS' : 'FAIL'}: ${JSON.stringify(result.counts)}\n`)
process.exitCode = pass ? 0 : 1

async function walk(root, files = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) await walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function exists(path) {
  try {
    return (await stat(path)).isFile()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function normalize(path) {
  return String(path ?? '').trim().replaceAll('\\', '/')
}

function repoPath(path) {
  return normalize(relative(cwd, path))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted && char === '"' && text[index + 1] === '"') {
      field += '"'
      index += 1
    } else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      field = ''
    } else field += char
  }

  row.push(field)
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}
