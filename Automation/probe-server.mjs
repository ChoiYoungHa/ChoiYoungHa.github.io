// M0a 검증 전용 1회성 서버 (Node 내장 모듈만 사용, 의존성 0).
//
// 왜 vite preview 대신 이걸 쓰는가:
//   1) 헤드리스 Chrome 의 --virtual-time-budget 은 실제 GPU 대기(requestAdapter/
//      requestDevice)보다 먼저 만료돼 결과를 못 받는다(실측). 페이지가 결과를 POST 하면
//      네트워크 fetch 가 pending 이라 가상시간이 멈춰 기다려준다.
//   2) 기대한 결과 수를 다 받으면 **스스로 종료**한다. 고아 프로세스가 구조적으로 안 남는다.
//   3) 하드 타임아웃이 있어 어떤 경우에도 종료된다.
//
// 사용: node Automation/probe-server.mjs <port> <expected-count> <timeout-ms>

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const PORT = Number(process.argv[2] ?? 5183)
const EXPECTED = Number(process.argv[3] ?? 1)
const TIMEOUT_MS = Number(process.argv[4] ?? 120000)

const ROOT = resolve(process.cwd())
const DIST = join(ROOT, 'dist')
const OUT = join(ROOT, 'Docs', 'm0a')
await mkdir(OUT, { recursive: true })

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

let received = 0
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (req.method === 'POST' && url.pathname === '/result') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString('utf8')
    const name = url.searchParams.get('name') ?? `result-${received}`
    await writeFile(join(OUT, `${name}.json`), body, 'utf8')
    received += 1
    process.stdout.write(`RESULT ${name} (${received}/${EXPECTED})\n`)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    if (received >= EXPECTED) setTimeout(() => shutdown(0), 300)
    return
  }

  let p = url.pathname === '/' ? '/index.html' : url.pathname
  try {
    const buf = await readFile(join(DIST, p))
    res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found: ' + p)
  }
})

function shutdown(code) {
  server.close(() => process.exit(code))
  setTimeout(() => process.exit(code), 1500).unref()
}

const hardStop = setTimeout(() => {
  process.stdout.write(`TIMEOUT after ${TIMEOUT_MS}ms (received ${received}/${EXPECTED})\n`)
  shutdown(received >= EXPECTED ? 0 : 2)
}, TIMEOUT_MS)
hardStop.unref?.()

server.listen(PORT, () => process.stdout.write(`LISTENING ${PORT} expecting ${EXPECTED}\n`))
