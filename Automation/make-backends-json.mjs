// M0a-07 산출물: 두 백엔드 실측 결과를 backends.json 하나로 합친다.
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'Docs', 'm0a')
const read = async (n) => JSON.parse(await readFile(join(OUT, n), 'utf8'))
const size = async (n) => {
  try {
    return (await stat(join(OUT, n))).size
  } catch {
    return 0
  }
}

const gpu = await read('m0a07-webgpu.json')
const gl = await read('m0a07-webgl.json')
const pureGpu = await read('m0a04-webgpu.json')
const pureGl = await read('m0a06-webgl.json')

const doc = {
  at: new Date().toISOString(),
  note: '헤드리스 Chrome(--headless=new --use-angle=d3d11 --enable-unsafe-webgpu)에서 실측. fps는 헤드리스 값이므로 성능 관문 근거가 아니다(계획서.md §4-3).',
  machine: 'LG gram 16ZD90SP-GX59K / Core Ultra 5 125H / Intel Arc Xe-LPG / RAM 32GB',
  backends: [
    {
      row: 'M0a-04',
      scope: '순수 three WebGPURenderer (R3F 없음)',
      url: '/probe.html',
      forceWebGL: pureGpu.forceWebGL,
      backend: pureGpu.backend,
      adapter: pureGpu.adapter,
      angle: pureGpu.angle,
      init: pureGpu.init,
      deviceOk: pureGpu.deviceOk,
    },
    {
      row: 'M0a-06',
      scope: '순수 three WebGPURenderer, forceWebGL 강제',
      url: '/probe.html?gl=webgl',
      forceWebGL: pureGl.forceWebGL,
      backend: pureGl.backend,
      adapter: pureGl.adapter,
      angle: pureGl.angle,
      init: pureGl.init,
      deviceOk: pureGl.deviceOk,
    },
    {
      row: 'M0a-07',
      scope: 'R3F 앱 전체',
      url: '/index.html',
      forceWebGL: gpu.forceWebGL,
      backend: gpu.backend,
      adapter: gpu.adapter,
      angle: gpu.angle,
      canvas: gpu.canvas,
      preset: gpu.preset,
      errorCount: gpu.errorCount,
      sceneCounts: gpu.sceneCounts,
      hudText: gpu.hud,
      png: `m0a07-webgpu.png (${await size('m0a07-webgpu.png')} bytes)`,
      fps_headless: gpu.fps,
    },
    {
      row: 'M0a-07',
      scope: 'R3F 앱 전체, forceWebGL 강제',
      url: '/index.html?gl=webgl',
      forceWebGL: gl.forceWebGL,
      backend: gl.backend,
      adapter: gl.adapter,
      angle: gl.angle,
      canvas: gl.canvas,
      preset: gl.preset,
      errorCount: gl.errorCount,
      sceneCounts: gl.sceneCounts,
      hudText: gl.hud,
      png: `m0a07-webgl.png (${await size('m0a07-webgl.png')} bytes)`,
      fps_headless: gl.fps,
    },
  ],
  checks: {
    'WebGPU 경로 backend=WebGPU': gpu.backend === 'WebGPU',
    'forceWebGL 경로 backend=WebGL2': gl.backend === 'WebGL2',
    '두 경로 모두 canvas 1280x720': gpu.canvas.w === 1280 && gpu.canvas.h === 720 && gl.canvas.w === 1280 && gl.canvas.h === 720,
    '두 경로 모두 console error 0': gpu.errorCount === 0 && gl.errorCount === 0,
    '씬 3요소(바닥/큐브 mesh, 광원 light) 존재':
      gpu.sceneCounts?.mesh >= 2 && gpu.sceneCounts?.light >= 1,
    'adapter 하드웨어(xe-lpg)': String(gpu.adapter).includes('xe-lpg'),
  },
  known_issue: {
    'renderer.info.render.calls':
      '1초 집계값이 768/696으로 나왔다. 프레임당 값이 아니라 **누적값**으로 보인다(6 mesh × 약 144프레임 ≈ 700). 계획서 §4-1의 드로우콜 예산은 프레임당 기준이므로, M0-b 측정기는 프레임 수로 나누거나 프레임 경계에서 reset 후 읽어야 한다.',
    'renderer.info.render.triangles':
      'WebGPU/WebGL 백엔드 모두 0으로 보고됐다. 삼각형 예산(≤600K) 검증에 이 값을 그대로 쓸 수 없다. M0-b에서 대체 측정원이 필요하다.',
  },
}

doc.result = Object.values(doc.checks).every(Boolean) ? 'PASS' : 'FAIL'
await writeFile(join(OUT, 'backends.json'), JSON.stringify(doc, null, 2), 'utf8')
for (const [k, v] of Object.entries(doc.checks)) console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`)
console.log(`\nRESULT: ${doc.result}`)
process.exit(doc.result === 'PASS' ? 0 : 1)
