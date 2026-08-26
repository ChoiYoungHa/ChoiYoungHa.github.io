/** 지형 높이만 주입받는 순수 경사 마스크. */
export type SampleHeight = (x: number, z: number) => number

export const MAX_SCATTER_SLOPE_DEG = 25
export const DEFAULT_SAMPLE_DISTANCE = 0.5

/** 중앙 차분으로 (x,z)의 최대 경사각을 구한다. */
export function slopeDegreesAt(
  x: number,
  z: number,
  sampleHeight: SampleHeight,
  sampleDistance: number = DEFAULT_SAMPLE_DISTANCE,
): number {
  if (!(sampleDistance > 0)) throw new RangeError('sampleDistance must be greater than zero')

  const dx =
    (sampleHeight(x + sampleDistance, z) - sampleHeight(x - sampleDistance, z)) /
    (2 * sampleDistance)
  const dz =
    (sampleHeight(x, z + sampleDistance) - sampleHeight(x, z - sampleDistance)) /
    (2 * sampleDistance)
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI
}

/** 계획서 §4-2: 25° 이상이면 배치를 금지한다. */
export function isExcludedBySlope(
  x: number,
  z: number,
  sampleHeight: SampleHeight,
  maxSlopeDeg: number = MAX_SCATTER_SLOPE_DEG,
  sampleDistance: number = DEFAULT_SAMPLE_DISTANCE,
): boolean {
  return slopeDegreesAt(x, z, sampleHeight, sampleDistance) >= maxSlopeDeg
}

/** scatter()의 reject 계약 `(x,z)=>boolean`에 맞춘다. */
export function createSlopeExclusion(
  sampleHeight: SampleHeight,
  maxSlopeDeg: number = MAX_SCATTER_SLOPE_DEG,
  sampleDistance: number = DEFAULT_SAMPLE_DISTANCE,
): (x: number, z: number) => boolean {
  return (x, z) => isExcludedBySlope(x, z, sampleHeight, maxSlopeDeg, sampleDistance)
}
