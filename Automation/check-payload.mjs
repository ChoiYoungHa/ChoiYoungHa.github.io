#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'

const BOOT_LIMIT = 4_000_000
const CORE_LIMIT = 12_000_000
const TOTAL_LIMIT = 60_000_000
const SINGLE_LIMIT = 20_000_000
const manifestPath = 'src/data/loading-manifest.json'

let outPath = 'Docs/perf/m4-payload.json'
let actualBuild = false
for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--out' && process.argv[index + 1]) outPath = process.argv[++index]
  else if (process.argv[index] === '--actual-build') actualBuild = true
  else {
    process.stderr.write('usage: node Automation/check-payload.mjs [--actual-build] [--out <path>]\n')
    process.exit(2)
  }
}

const cwd = process.cwd()
const manifest = JSON.parse(readFileSync(resolve(cwd, manifestPath), 'utf8'))
const phases = ['boot', 'core', 'detail']
const errors = []
const warnings = []
const measuredItems = {}
const ids = []

for (const phase of phases) {
  const items = manifest.phases?.[phase]
  if (!Array.isArray(items)) {
    errors.push({ type: 'missing_phase', phase })
    measuredItems[phase] = []
    continue
  }

  measuredItems[phase] = items.map((item) => {
    ids.push(item.id)
    const resolvedItem = resolveBuiltItem(item.url)
    let statBytes = null
    try {
      statBytes = statSync(resolvedItem.path).size
    } catch (error) {
      errors.push({ type: 'missing_file', id: item.id, url: item.url, message: error.code ?? error.message })
    }

    const embedded = item.bytes === 0 && String(item.kind).startsWith('procedural-')
    const measuredBytes = embedded ? 0 : statBytes
    if (statBytes !== null && !embedded && item.bytes !== statBytes) {
      const mismatch = {
        type: 'byte_mismatch',
        id: item.id,
        url: item.url,
        resolvedUrl: resolvedItem.url,
        declared: item.bytes,
        actual: statBytes,
      }
      if (actualBuild) warnings.push(mismatch)
      else errors.push(mismatch)
    }
    return { ...item, resolvedUrl: resolvedItem.url, statBytes, measuredBytes, embedded }
  })
}

const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
if (duplicateIds.length > 0) errors.push({ type: 'duplicate_ids', ids: duplicateIds })

const phaseBytes = Object.fromEntries(
  phases.map((phase) => [phase, measuredItems[phase].reduce((sum, item) => sum + (item.measuredBytes ?? 0), 0)]),
)
const cumulativeBytes = {
  boot: phaseBytes.boot,
  core: phaseBytes.boot + phaseBytes.core,
  detail: phaseBytes.boot + phaseBytes.core + phaseBytes.detail,
}
const transferableItems = phases.flatMap((phase) => measuredItems[phase]).filter((item) => item.measuredBytes > 0)
const singleMax = transferableItems.reduce(
  (max, item) => item.measuredBytes > max.bytes ? { id: item.id, url: item.url, bytes: item.measuredBytes } : max,
  { id: null, url: null, bytes: 0 },
)
const checks = {
  bootWithinBudget: cumulativeBytes.boot <= BOOT_LIMIT,
  coreWithinBudget: cumulativeBytes.core <= CORE_LIMIT,
  totalWithinBudget: cumulativeBytes.detail <= TOTAL_LIMIT,
  singleWithinBudget: singleMax.bytes <= SINGLE_LIMIT,
  manifestPhaseSummaryMatches: JSON.stringify(phaseBytes) === JSON.stringify(manifest.summary?.phaseBytes),
  manifestCumulativeSummaryMatches: JSON.stringify(cumulativeBytes) === JSON.stringify(manifest.summary?.cumulativeBytes),
  duplicateIdCount: duplicateIds.length,
  errors: errors.length,
}
if (actualBuild && !checks.manifestPhaseSummaryMatches) {
  warnings.push({ type: 'manifest_phase_summary_differs_from_actual_build' })
}
if (actualBuild && !checks.manifestCumulativeSummaryMatches) {
  warnings.push({ type: 'manifest_cumulative_summary_differs_from_actual_build' })
}
const pass = actualBuild
  ? checks.bootWithinBudget && checks.coreWithinBudget && checks.totalWithinBudget &&
    checks.singleWithinBudget && checks.duplicateIdCount === 0 && checks.errors === 0
  : Object.entries(checks).every(([key, value]) =>
      key === 'duplicateIdCount' || key === 'errors' ? value === 0 : value === true,
    )
const buildHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
const result = {
  buildHash,
  mode: actualBuild ? 'actual-build' : 'snapshot-strict',
  manifestPath,
  manifestMeasuredFromHead: manifest.measuredFromHead,
  note: actualBuild
    ? 'M4-16 actual-build mode resolves current hash-named dist chunks; manifest snapshot differences remain warnings.'
    : 'Hash-named dist chunks are snapshot-bound; regenerate loading-manifest.json after the next build if chunk hashes change.',
  phaseBytes,
  cumulativeBytes,
  totalBytes: cumulativeBytes.detail,
  singleMax,
  limitsBytes: {
    boot: BOOT_LIMIT,
    coreCumulative: CORE_LIMIT,
    total: TOTAL_LIMIT,
    single: SINGLE_LIMIT,
  },
  checks,
  errors,
  warnings,
  pass,
}

const output = `${JSON.stringify(result, null, 2)}\n`
const absoluteOut = resolve(cwd, outPath)
mkdirSync(dirname(absoluteOut), { recursive: true })
writeFileSync(absoluteOut, output, 'utf8')
process.stdout.write(output)
process.exitCode = pass ? 0 : 1

// M4-16 (R39-C): build-gate mode maps a stale hash-named snapshot URL to the
// single same-stem chunk emitted by the current build. Strict mode is unchanged.
function resolveBuiltItem(url) {
  const requestedPath = resolve(cwd, url)
  try {
    statSync(requestedPath)
    return { path: requestedPath, url }
  } catch (error) {
    if (!actualBuild || error.code !== 'ENOENT') return { path: requestedPath, url }
  }

  const requestedName = basename(requestedPath)
  const match = /^(.*)-[^.]+(\.[^.]+)$/.exec(requestedName)
  if (!match) return { path: requestedPath, url }
  const [directory, prefix, extension] = [dirname(requestedPath), `${match[1]}-`, match[2]]
  let candidates = []
  try {
    candidates = readdirSync(directory).filter(
      (name) => name.startsWith(prefix) && name.endsWith(extension),
    )
  } catch {
    return { path: requestedPath, url }
  }
  if (candidates.length !== 1) {
    if (candidates.length > 1) {
      errors.push({ type: 'ambiguous_hashed_chunk', url, candidates })
    }
    return { path: requestedPath, url }
  }
  const path = resolve(directory, candidates[0])
  return { path, url: relative(cwd, path).replaceAll('\\', '/') }
}
