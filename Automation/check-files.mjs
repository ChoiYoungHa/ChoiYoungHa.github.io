import { execFileSync } from 'node:child_process'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'

const DEFAULT_OUT = 'Docs/perf/m2-files.csv'
const INTERNAL_LIMIT = 20_000_000
const PLATFORM_LIMIT = 25 * 1024 * 1024

function parseArgs(argv) {
  const result = { out: DEFAULT_OUT, dirs: [] }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out' && argv[i + 1]) result.out = argv[++i]
    else if (argv[i] === '--dir' && argv[i + 1]) result.dirs.push(argv[++i])
    else throw new Error(`usage: node Automation/check-files.mjs [--out <path>] [--dir <path>]...`)
  }
  return result
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function walk(root, files = []) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) await walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

async function newestMtime(path) {
  if (!(await exists(path))) return -Infinity
  const info = await stat(path)
  if (info.isFile()) return info.mtimeMs
  const files = await walk(path)
  if (files.length === 0) return -Infinity
  return Math.max(...(await Promise.all(files.map(async (file) => (await stat(file)).mtimeMs))))
}

async function distIsFresh(cwd) {
  const distMtime = await newestMtime(resolve(cwd, 'dist'))
  if (!Number.isFinite(distMtime)) return false

  const inputs = [
    'src',
    'public',
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
  ]
  const inputMtime = Math.max(...(await Promise.all(inputs.map((path) => newestMtime(resolve(cwd, path))))))
  return distMtime >= inputMtime
}

function csv(value) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function repoPath(cwd, path) {
  const value = relative(cwd, path).replaceAll('\\', '/')
  return value.startsWith('../') ? path.replaceAll('\\', '/') : value
}

async function main() {
  const cwd = process.cwd()
  const args = parseArgs(process.argv.slice(2))
  const requestedDirs = args.dirs.length > 0
    ? args.dirs
    : ['public/models', ...(await distIsFresh(cwd) ? ['dist'] : [])]

  const roots = []
  for (const dir of requestedDirs) {
    const root = resolve(cwd, dir)
    if (await exists(root)) roots.push(root)
  }

  const files = (await Promise.all(roots.map((root) => walk(root))))
    .flat()
    .map((path) => ({ path, name: repoPath(cwd, path) }))
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  const rows = []
  for (const file of files) {
    const bytes = (await stat(file.path)).size
    rows.push([
      file.name,
      bytes,
      (bytes / 1_000_000).toFixed(6),
      bytes > INTERNAL_LIMIT,
      bytes > PLATFORM_LIMIT,
    ].map(csv).join(','))
  }

  const dist = resolve(cwd, 'dist').toLowerCase()
  const distIncluded = roots.some((root) => root.toLowerCase() === dist)
  const buildHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  const output = [
    `# build_hash=${buildHash},dist_included=${distIncluded}`,
    'path,bytes,MB,>20MB,>25MiB',
    ...rows,
    '',
  ].join('\n')

  const out = resolve(cwd, args.out)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, output, 'utf8')
  console.log(`wrote ${repoPath(cwd, out)} (${rows.length} files, dist_included=${distIncluded})`)
}

await main()
