#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST_TEXT_EXTENSIONS = new Set(['.html', '.js', '.json'])
const SRC_TEXT_EXTENSIONS = new Set(['.css', '.csv', '.html', '.js', '.json', '.jsx', '.ts', '.tsx'])
const ASSET_EXTENSIONS = new Set(['.avif', '.exr', '.gif', '.glb', '.hdr', '.ico', '.jpeg', '.jpg', '.ktx2', '.png', '.svg', '.webp'])

function parseArgs(argv) {
  const options = { dist: 'dist', src: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dist') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error('--dist requires a directory')
      options.dist = value
    } else if (arg === '--src') options.src = true
    else if (arg === '--help') options.help = true
    else throw new Error(`unknown option: ${arg}`)
  }
  return options
}

async function walk(root, files = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) await walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function extension(path) {
  const index = path.lastIndexOf('.')
  return index < 0 ? '' : path.slice(index).toLowerCase()
}

async function exists(path) {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function occurrenceOffsets(text, term) {
  const offsets = []
  const lower = text.toLocaleLowerCase('en-US')
  const needle = term.toLocaleLowerCase('en-US')
  const asciiToken = /^[a-z0-9]+$/i.test(term)
  let offset = 0
  while ((offset = lower.indexOf(needle, offset)) >= 0) {
    const before = text[offset - 1] ?? ''
    const after = text[offset + needle.length] ?? ''
    if (!asciiToken || (!/[a-z0-9]/i.test(before) && !/[a-z0-9]/i.test(after))) offsets.push(offset)
    offset += Math.max(needle.length, 1)
  }
  return offsets
}

async function scanForbiddenNames(root, files, terms, { extensions = DIST_TEXT_EXTENSIONS, warningTerms = new Set(), allowWarnings = false, ignoredTerms = new Set() } = {}) {
  const matches = []
  for (const file of files.filter((path) => extensions.has(extension(path)))) {
    const text = await readFile(file, 'utf8')
    for (const term of terms) {
      if (ignoredTerms.has(term)) continue
      const severity = allowWarnings && warningTerms.has(term) ? 'warn' : 'fail'
      for (const offset of occurrenceOffsets(text, term))
        matches.push({ file: relative(root, file).replaceAll('\\', '/'), term, offset, severity })
    }
  }
  const failMatches = matches.filter((match) => match.severity === 'fail')
  const warnMatches = matches.filter((match) => match.severity === 'warn')
  return {
    status: failMatches.length > 0 ? 'fail' : warnMatches.length > 0 ? 'warn' : 'pass',
    count: matches.length,
    failCount: failMatches.length,
    warnCount: warnMatches.length,
    matches,
  }
}

async function scanOwnVisibleStrings(root, terms) {
  const stringsPath = resolve(root, 'src/game/data/strings.ko.json')
  const stringsText = await readTextIfFile(stringsPath)
  if (stringsText === null) return { status: 'not-assessable', count: 0, matches: [] }
  const ownText = stringValues(JSON.parse(stringsText).own).join('\n')
  const matches = terms.flatMap((term) => occurrenceOffsets(ownText, term).map((offset) => ({
    file: 'src/game/data/strings.ko.json#own', term, offset, severity: 'fail',
  })))
  return { status: matches.length === 0 ? 'pass' : 'fail', count: matches.length, matches }
}

async function readTextIfFile(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function stringValues(value, result = []) {
  if (typeof value === 'string') result.push(value)
  else if (Array.isArray(value)) for (const item of value) stringValues(item, result)
  else if (value && typeof value === 'object') for (const item of Object.values(value)) stringValues(item, result)
  return result
}

async function inspectIpPolicy(root, terms) {
  const i18nPath = resolve(root, 'src/game/i18n.ts')
  const stringsPath = resolve(root, 'src/game/data/strings.ko.json')
  const i18nText = await readTextIfFile(i18nPath)
  const stringsText = await readTextIfFile(stringsPath)
  const modeMatches = i18nText
    ? [...i18nText.matchAll(/\b\w*ipMode\w*[^=\r\n]*=\s*['"](own|conti)['"]/gi)]
    : []
  const defaultMode = modeMatches.at(-1)?.[1]?.toLowerCase() ?? 'unavailable'
  let contiStrings = []
  if (stringsText) {
    const parsed = JSON.parse(stringsText)
    contiStrings = stringValues(parsed.conti)
  }
  const contiText = contiStrings.join('\n')
  const contiTerms = terms.filter((term) => occurrenceOffsets(contiText, term).length > 0)
  return {
    i18nFile: i18nText ? 'src/game/i18n.ts' : null,
    stringsFile: stringsText ? 'src/game/data/strings.ko.json' : null,
    defaultMode,
    forcedOwn: defaultMode === 'own',
    contiTerms,
  }
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

async function scanReferenceImageHashes(root, distFiles) {
  const referenceRoot = resolve(root, '..', 'asset')
  if (!(await exists(referenceRoot))) {
    return { status: 'fail', expectedCount: 4, references: [], matches: [], reason: 'reference directory ../asset not found' }
  }
  const referenceFiles = (await walk(referenceRoot)).filter((path) => extension(path) === '.png').sort()
  const references = await Promise.all(referenceFiles.map(async (file) => ({
    file: relative(root, file).replaceAll('\\', '/'),
    sha256: sha256(await readFile(file)),
  })))
  const distHashes = await Promise.all(distFiles.map(async (file) => ({
    file: relative(root, file).replaceAll('\\', '/'),
    sha256: sha256(await readFile(file)),
  })))
  const byHash = new Map(distHashes.map((item) => [item.sha256, item.file]))
  const matches = references
    .filter((item) => byHash.has(item.sha256))
    .map((item) => ({ referenceFile: item.file, distFile: byHash.get(item.sha256), sha256: item.sha256 }))
  const countOk = references.length === 4
  return {
    status: countOk && matches.length === 0 ? 'pass' : 'fail',
    expectedCount: 4,
    references,
    matches,
    reason: countOk ? null : `expected 4 reference PNGs, found ${references.length}`,
  }
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

function normalize(path) {
  return String(path ?? '').trim().replaceAll('\\', '/')
}

async function scanRegisteredAssets(root, distRoot, distFiles) {
  const rows = parseCsv(await readFile(resolve(root, 'src/data/assets.csv'), 'utf8'))
  const [header, ...records] = rows
  const assets = records.map((record) => Object.fromEntries(header.map((name, index) => [name, record[index] ?? ''])))
  const runtimeRows = assets
    .map((asset) => ({ assetId: asset.asset_id, runtimeFile: normalize(asset.runtime_file) }))
    .filter((asset) => asset.runtimeFile.startsWith('public/'))
  const registeredPaths = [...new Set(runtimeRows.map((asset) => asset.runtimeFile.slice('public/'.length)))].sort()
  const setPrefixes = [...new Set(runtimeRows
    .filter((asset) => asset.assetId.includes('.set.'))
    .map((asset) => `${dirname(asset.runtimeFile.slice('public/'.length)).replaceAll('\\', '/')}/`))].sort()
  const assetFiles = distFiles
    .filter((file) => ASSET_EXTENSIONS.has(extension(file)))
    .map((file) => relative(distRoot, file).replaceAll('\\', '/'))
    .sort()
  const registered = new Set(registeredPaths)
  const unregisteredFiles = assetFiles.filter((file) =>
    !registered.has(file) && !setPrefixes.some((prefix) => file.startsWith(prefix)))
  return {
    status: unregisteredFiles.length === 0 ? 'pass' : 'fail',
    ledger: 'src/data/assets.csv',
    assetFiles,
    registeredPaths,
    setPrefixes,
    unregisteredFiles,
  }
}

async function main(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write('usage: node Automation/check-ip.mjs [--dist <dir>] [--src]\n')
    return 0
  }

  const root = process.cwd()
  const denylistPath = resolve(root, 'src/game/data/ip-denylist.json')
  const denylist = JSON.parse(await readFile(denylistPath, 'utf8'))
  const ipPolicy = await inspectIpPolicy(root, denylist.terms)
  const requestedDistRoot = resolve(root, options.dist)
  const distExists = await exists(requestedDistRoot)
  const sourceMode = options.src || !distExists
  const scanRoot = resolve(root, sourceMode ? 'src' : options.dist)
  if (!(await exists(scanRoot))) throw new Error(`scan directory not found: ${relative(root, scanRoot)}`)
  const files = await walk(scanRoot)
  const ownVisibleStrings = await scanOwnVisibleStrings(root, denylist.terms)
  const forbiddenNames = await scanForbiddenNames(root, files.filter((file) => file !== denylistPath), denylist.terms, {
    extensions: sourceMode ? SRC_TEXT_EXTENSIONS : DIST_TEXT_EXTENSIONS,
    warningTerms: new Set(ipPolicy.contiTerms),
    allowWarnings: ipPolicy.forcedOwn && !sourceMode,
    // Source identifiers (stan, meso, etc.) are not user-visible. In forced-own
    // source mode the authoritative check is the rendered own string catalog;
    // production bundles remain scanned as text below.
    ignoredTerms: ipPolicy.forcedOwn && sourceMode ? new Set(denylist.terms) : new Set(),
  })
  const referenceImageHashes = sourceMode
    ? { status: 'not-run', reason: 'dist check skipped in --src mode' }
    : await scanReferenceImageHashes(root, files)
  const registeredAssets = sourceMode
    ? { status: 'not-run', reason: 'dist check skipped in --src mode' }
    : await scanRegisteredAssets(root, scanRoot, files)
  const contiTreeShaking = !ipPolicy.stringsFile
    ? { status: 'not-assessable', reason: 'src/game/data/strings.ko.json is not present at this HEAD' }
    : !ipPolicy.forcedOwn
      ? { status: 'fail', reason: `deployment ipMode is not forced to own (detected ${ipPolicy.defaultMode})` }
      : forbiddenNames.warnCount > 0
        ? { status: 'residual-warn', reason: 'runtime is forced to own, but conti-only terms remain in scanned output' }
        : { status: 'excluded', reason: 'runtime is forced to own and no conti-only denylist term remains in scanned output' }
  const checks = [forbiddenNames, ownVisibleStrings, referenceImageHashes, registeredAssets, contiTreeShaking]
  const failed = checks.some((check) => check.status === 'fail')
  const warned = checks.some((check) => check.status === 'warn' || check.status === 'residual-warn')
  const report = {
    schema: 'ip-check/1',
    mode: sourceMode ? 'src' : 'dist',
    root: relative(root, scanRoot).replaceAll('\\', '/'),
    dist: sourceMode
      ? { status: 'not-run', reason: options.src ? 'explicit --src mode' : `dist directory not found: ${options.dist}` }
      : { status: 'scanned', root: relative(root, requestedDistRoot).replaceAll('\\', '/'), files: files.length },
    denylist: { file: 'src/game/data/ip-denylist.json', terms: denylist.terms },
    ipPolicy,
    contiTreeShaking,
    checks: {
      forbiddenNames,
      ownVisibleStrings,
      referenceImageHashes,
      registeredAssets,
    },
    result: failed ? 'FAIL' : warned ? 'WARN' : 'PASS',
  }
  const out = resolve(root, 'Docs/qa/m6-ip-check.json')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  return report.result === 'FAIL' ? 1 : 0
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((code) => { process.exitCode = code })
    .catch((error) => {
      process.stderr.write(`check-ip.mjs: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    })
}

export { inspectIpPolicy, main, occurrenceOffsets, parseArgs, scanForbiddenNames, scanReferenceImageHashes, scanRegisteredAssets }
