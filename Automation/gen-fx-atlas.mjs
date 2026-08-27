import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const IMPORTER = join(ROOT, 'Automation/import-conti-2d-assets.py')

export function importContiFxAtlas() {
  const result = spawnSync('py', [IMPORTER, '--output-root', ROOT], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `conti importer exited ${result.status}`)
  }
  return JSON.parse(result.stdout)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(importContiFxAtlas(), null, 2))
}
