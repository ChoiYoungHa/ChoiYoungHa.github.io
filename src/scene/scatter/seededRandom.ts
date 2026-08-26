/**
 * M1-17 — 결정론 산포용 PRNG.
 *
 * 왜 직접 구현하나: 새 npm 패키지가 금지돼 있고, `Math.random()` 은 seed 를 못 준다.
 * 산포가 결정론이어야 하는 이유는 성능 측정 때문이다 — 실행마다 나무 위치가 달라지면
 * 같은 동선을 3회 재도 프레임 수가 흔들려 `계획서.md §4-3` 의 "3회 중앙값"이 무의미해진다.
 *
 * mulberry32: 32비트 상태 1개짜리 PRNG. 구현이 짧고 주기(2^32)가 이 용도에 충분하다.
 * 암호용이 아니다 — 산포·변형 배치 전용이다.
 */

export type Rng = () => number

/** seed 로부터 0 이상 1 미만 난수를 내는 함수를 만든다. 같은 seed → 같은 수열. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 문자열 seed 를 32비트 정수로 — 라벨로 seed 를 관리하기 위한 FNV-1a. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** [min, max) 실수. */
export function randomRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

export interface ScatterPoint {
  x: number
  z: number
  /** 0..2PI. 같은 종을 회전만 바꿔 반복 배치할 때 쓴다. */
  rotationY: number
  /** 스케일 배수. 실루엣 반복을 깨는 최소 변형. */
  scale: number
}

export interface ScatterOptions {
  count: number
  halfExtent: number
  scaleMin?: number
  scaleMax?: number
  /** true 를 돌려주면 그 후보를 버린다(길·전망 마스크가 여기 들어온다). */
  reject?: (x: number, z: number) => boolean
  /** reject 로 버릴 때 무한 루프를 막는 상한. */
  maxAttempts?: number
}

/**
 * seed 하나로 같은 배열을 만든다. reject 로 걸러도 결정론이 유지된다
 * (버린 후보도 수열을 똑같이 소비하므로).
 */
export function scatter(seed: number, options: ScatterOptions): ScatterPoint[] {
  const { count, halfExtent, scaleMin = 0.85, scaleMax = 1.25, reject } = options
  const maxAttempts = options.maxAttempts ?? count * 20
  const rng = mulberry32(seed)
  const points: ScatterPoint[] = []

  for (let attempt = 0; attempt < maxAttempts && points.length < count; attempt++) {
    const x = randomRange(rng, -halfExtent, halfExtent)
    const z = randomRange(rng, -halfExtent, halfExtent)
    const rotationY = rng() * Math.PI * 2
    const scale = randomRange(rng, scaleMin, scaleMax)
    if (reject?.(x, z)) continue
    points.push({ x, z, rotationY, scale })
  }
  return points
}

/**
 * 결과 배열의 내용 해시. 좌표를 소수 6자리로 고정해 문자열로 만든 뒤 FNV-1a 를 돌린다.
 * "같은 seed 결과 hash 3회 동일"(M1-17 완료 조건)을 이 값으로 판정한다.
 */
export function hashScatter(points: ScatterPoint[]): string {
  const text = points
    .map((p) => `${p.x.toFixed(6)},${p.z.toFixed(6)},${p.rotationY.toFixed(6)},${p.scale.toFixed(6)}`)
    .join(';')
  return hashSeed(text).toString(16).padStart(8, '0')
}
