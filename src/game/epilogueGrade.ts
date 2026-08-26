import lookdev from '../data/lookdev.json' with { type: 'json' }

export const EPILOGUE_GRADE_DURATION_MS = 2_000
export const EPILOGUE_WARM_EXPOSURE_MULTIPLIER = lookdev.epilogueWarmExposureMultiplier

/** Pure exposure curve; renderer mutation stays at the runtime boundary below. */
export function epilogueExposureAt(elapsedMs: number, baseExposure: number): number {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : EPILOGUE_GRADE_DURATION_MS
  const linear = Math.min(1, elapsed / EPILOGUE_GRADE_DURATION_MS)
  const eased = linear * linear * (3 - 2 * linear)
  return baseExposure * (1 + (EPILOGUE_WARM_EXPOSURE_MULTIPLIER - 1) * eased)
}
