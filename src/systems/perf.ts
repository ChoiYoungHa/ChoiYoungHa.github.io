export type MeasuredNumber = number | '확인 불가'

interface RendererInfoLike {
  autoReset?: boolean
  reset?: () => void
  render?: {
    calls?: number
    frameCalls?: number
    drawCalls?: number
  }
  memory?: { textures?: number; texturesSize?: number; programs?: number }
  programs?: unknown[] | { size?: number }
}

export interface RendererForPerf {
  info?: RendererInfoLike
}

export interface PerfFrame {
  at: number
  calls: number
  programs: number
  textures: number
  textureGpuMB: MeasuredNumber
  jsHeapMB: MeasuredNumber
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

type PerfFrameListener = (frame: PerfFrame) => void

const listeners = new Set<PerfFrameListener>()
let owner: RendererForPerf | null = null
let previousRawCalls = 0

/** renderer.info를 읽고 reset하는 유일한 소유자. RuntimeProbe가 프레임 경계에서 1회 호출한다. */
export function sampleRendererFrame(renderer: RendererForPerf): PerfFrame {
  const info = renderer.info
  if (!info) throw new Error('renderer.info unavailable')

  if (owner !== renderer) {
    owner = renderer
    previousRawCalls = info.render?.calls ?? 0
    info.autoReset = false
  }

  const rawCalls = info.render?.calls ?? 0
  const calls =
    info.render?.drawCalls ??
    info.render?.frameCalls ??
    (rawCalls >= previousRawCalls ? rawCalls - previousRawCalls : rawCalls)
  previousRawCalls = rawCalls

  const frame: PerfFrame = {
    at: performance.now(),
    calls,
    programs: info.memory?.programs ?? readPrograms(info.programs),
    textures: info.memory?.textures ?? 0,
    textureGpuMB: readTextureGpuMB(info),
    jsHeapMB: readJsHeapMB(),
  }

  for (const listener of listeners) listener(frame)
  info.reset?.()
  return frame
}

/** RuntimeProbe가 발행한 동일 프레임 스트림으로 60초 성능 JSON을 만든다. */
export async function collectPerf(renderer: RendererForPerf): Promise<PerfResult> {
  if (!renderer.info) throw new Error('renderer.info unavailable')

  const startedAt = performance.now()
  let previousAt = startedAt
  let bucketStartedAt = startedAt
  let bucketFrames = 0
  let bucketCalls = 0
  let bucketPrograms = 0
  let bucketTextures = 0
  let maxCalls = 0
  let maxPrograms = 0
  let maxTextures = 0
  let textureGpuMB: MeasuredNumber = '확인 불가'
  let jsHeapPeakMB: MeasuredNumber = '확인 불가'
  const frameTimes: number[] = []
  const seconds: PerfSecond[] = []

  return new Promise((resolve) => {
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

    const onFrame = (frame: PerfFrame) => {
      const frameTime = frame.at - previousAt
      previousAt = frame.at
      frameTimes.push(frameTime)
      bucketFrames += 1
      bucketCalls = Math.max(bucketCalls, frame.calls)
      bucketPrograms = Math.max(bucketPrograms, frame.programs)
      bucketTextures = Math.max(bucketTextures, frame.textures)
      maxCalls = Math.max(maxCalls, frame.calls)
      maxPrograms = Math.max(maxPrograms, frame.programs)
      maxTextures = Math.max(maxTextures, frame.textures)
      textureGpuMB = maxMeasured(textureGpuMB, frame.textureGpuMB)
      jsHeapPeakMB = maxMeasured(jsHeapPeakMB, frame.jsHeapMB)

      if (frame.at - bucketStartedAt >= 1000) pushSecond(frame.at)
      if (frame.at - startedAt < 60_000) return

      listeners.delete(onFrame)
      if (bucketFrames > 0) pushSecond(frame.at)
      const elapsedSeconds = (frame.at - startedAt) / 1000
      const slowCount = Math.max(1, Math.ceil(frameTimes.length * 0.01))
      const slowFrames = [...frameTimes].sort((a, b) => b - a).slice(0, slowCount)
      const slowMean = slowFrames.reduce((sum, value) => sum + value, 0) / slowFrames.length
      resolve({
        duration: 60,
        sampleCount: frameTimes.length,
        avgFps: round(frameTimes.length / elapsedSeconds),
        onePercentLowFps: round(slowMean > 0 ? 1000 / slowMean : 0),
        oneSecondHitches: frameTimes.filter((value) => value >= 1000).length,
        maxCalls,
        maxTriangles: '확인 불가',
        maxPrograms,
        maxTextures,
        textureGpuMB,
        jsHeapPeakMB,
        seconds,
      })
    }

    listeners.add(onFrame)
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

function maxMeasured(current: MeasuredNumber, next: MeasuredNumber): MeasuredNumber {
  if (next === '확인 불가') return current
  return current === '확인 불가' ? next : Math.max(current, next)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
