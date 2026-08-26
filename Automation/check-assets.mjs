#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--json')) {
  process.stderr.write('usage: node Automation/check-assets.mjs [--json]\n')
  process.exit(2)
}

const cwd = process.cwd()
const publicRoots = ['public/models', 'public/env']
const assetsPath = resolve(cwd, 'src/data/assets.csv')
const rows = parseCsv(await readFile(assetsPath, 'utf8'))
const [header, ...records] = rows
const assets = records.map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ''])))

const publicFiles = (await Promise.all(publicRoots.map((root) => walk(resolve(cwd, root)))))
  .flat()
  .map((path) => repoPath(path))
  .filter((path) => !path.endsWith('/.gitkeep'))
  .sort()
const registeredPublicPaths = new Set(
  assets
    .map((asset) => normalize(asset.runtime_file))
    .filter((path) => publicRoots.some((root) => path.startsWith(`${root}/`))),
)

const unregisteredFiles = publicFiles.filter((path) => !registeredPublicPaths.has(path))
const missingRuntimeFiles = []
const emptyLicenseFields = []

for (const asset of assets) {
  const runtimeFile = normalize(asset.runtime_file)
  if (runtimeFile.startsWith('planned:')) {
    // master 2026-08-27: 아직 런타임에 배치하지 않은 자산(변환·배치 대기). 경로 계획만 기록하며 존재 검사 대상이 아니다.
    continue
  }
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
    publicFiles: publicFiles.length,
    registeredPublicPaths: registeredPublicPaths.size,
    modelFiles: publicFiles.filter((path) => path.startsWith('public/models/')).length,
    envFiles: publicFiles.filter((path) => path.startsWith('public/env/')).length,
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
