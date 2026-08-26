export type MeasuredNumber = number | '확인 불가'

interface RendererInfoLike {
  autoReset?: boolean
  reset?: () => void
  render?: {
    calls?: number
    frameCalls?: number
    drawCalls?: number
    triangles?: number
    frame?: number
  }
  memory?: { textures?: number; texturesSize?: number; programs?: number }
  programs?: unknown[] | { size?: number }
}

export interface PerfSecond {
  second: number
  fps: number
  calls: number
  triangles: MeasuredNumber
  programs: MeasuredNumber
  textures: number
}

export interface PerfResult {
  duration: 60
  sampleCount: number
  avgFps: number
  onePercentLowFps: number
  oneSecondHitches: number
  maxCalls: number
  maxTriangles: MeasuredNumber
  maxPrograms: MeasuredNumber
  maxTextures: number
  textureGpuMB: MeasuredNumber
  jsHeapPeakMB: MeasuredNumber
  seconds: PerfSecond[]
}

export async function collectPerf(renderer: { info?: RendererInfoLike }): Promise<PerfResult> {
  const info = renderer.info
  if (!info) throw new Error('renderer.info unavailable')

  const previousAutoReset = info.autoReset
  info.autoReset = false
  const startedAt = performance.now()
  let previousAt = startedAt
  let bucketStartedAt = startedAt
  let previousFrame = info.render?.frame ?? -1
  let previousRawCalls = info.render?.calls ?? 0
  let bucketFrames = 0
  let bucketCalls = 0
  let bucketPrograms = 0
  let bucketTextures = 0
  let maxCalls = 0
  let maxPrograms = 0
  let maxTextures = 0
  let textureGpuMB: MeasuredNumber = readTextureGpuMB(info)
  let jsHeapPeakMB = readJsHeapMB()
  const frameTimes: number[] = []
  const seconds: PerfSecond[] = []

  return new Promise((resolve) => {
    const finish = (now: number) => {
      if (bucketFrames > 0) pushSecond(now)
      info.autoReset = previousAutoReset
      const elapsedSeconds = (now - startedAt) / 1000
      const slowCount = Math.max(1, Math.ceil(frameTimes.length * 0.01))
      const slowFrames = [...frameTimes].sort((a, b) => b - a).slice(0, slowCount)
      const slowMean = slowFrames.reduce((sum, value) => sum + value, 0) / slowFrames.length
      const result: PerfResult = {
        duration: 60,
        sampleCount: frameTimes.length,
        avgFps: round(frameTimes.length / elapsedSeconds),
        onePercentLowFps: round(slowMean > 0 ? 1000 / slowMean : 0),
        oneSecondHitches: frameTimes.filter((value) => value >= 1000).length,
        maxCalls,
        maxTriangles: '확인 불가',
        maxPrograms: maxPrograms,
        maxTextures,
        textureGpuMB,
        jsHeapPeakMB,
        seconds,
      }
      resolve(result)
    }

    const pushSecond = (now: number) => {
      seconds.push({
        second: seconds.length + 1,
        fps: round((bucketFrames * 1000) / (now - bucketStartedAt)),
        calls: bucketCalls,
        triangles: '확인 불가',
        programs: bucketPrograms,
        textures: bucketTextures,
      })
      bucketStartedAt = now
      bucketFrames = 0
      bucketCalls = 0
      bucketPrograms = 0
      bucketTextures = 0
    }

    const tick = (now: number) => {
      const frame = info.render?.frame ?? previousFrame + 1
      if (frame !== previousFrame) {
        const frameTime = now - previousAt
        previousAt = now
        previousFrame = frame
        frameTimes.push(frameTime)
        bucketFrames += 1
        const rawCalls = info.render?.calls ?? 0
        const calls =
          info.render?.drawCalls ??
          info.render?.frameCalls ??
          (rawCalls >= previousRawCalls ? rawCalls - previousRawCalls : rawCalls)
        previousRawCalls = rawCalls
        const programs = info.memory?.programs ?? readPrograms(info.programs)
        const textures = info.memory?.textures ?? 0
        bucketCalls = Math.max(bucketCalls, calls)
        bucketPrograms = Math.max(bucketPrograms, programs)
        bucketTextures = Math.max(bucketTextures, textures)
        maxCalls = Math.max(maxCalls, calls)
        maxPrograms = Math.max(maxPrograms, programs)
        maxTextures = Math.max(maxTextures, textures)
        const textureMB = readTextureGpuMB(info)
        if (textureMB !== '확인 불가') {
          textureGpuMB = textureGpuMB === '확인 불가' ? textureMB : Math.max(textureGpuMB, textureMB)
        }
        const heap = readJsHeapMB()
        if (heap !== '확인 불가') {
          jsHeapPeakMB = jsHeapPeakMB === '확인 불가' ? heap : Math.max(jsHeapPeakMB, heap)
        }
        info.reset?.()
      }

      if (now - bucketStartedAt >= 1000) pushSecond(now)
      if (now - startedAt >= 60_000) finish(now)
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function readPrograms(programs: RendererInfoLike['programs']): number {
  if (Array.isArray(programs)) return programs.length
  return programs?.size ?? 0
}

function readTextureGpuMB(info: RendererInfoLike): MeasuredNumber {
  const bytes = info.memory?.texturesSize
  if (typeof bytes === 'number') return round(bytes / 1024 / 1024)
  return info.memory?.textures === 0 ? 0 : '확인 불가'
}

function readJsHeapMB(): MeasuredNumber {
  const memory = performance as Performance & { memory?: { usedJSHeapSize?: number } }
  const bytes = memory.memory?.usedJSHeapSize
  return typeof bytes === 'number' ? round(bytes / 1024 / 1024) : '확인 불가'
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
