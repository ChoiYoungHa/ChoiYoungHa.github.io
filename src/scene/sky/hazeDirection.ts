export type HazeDirectionConfig = {
  enabled: boolean
  brightYawDeg: number
  gain: number
  maxAttenuation: number
}

const DEG_TO_RAD = Math.PI / 180

function requireFinite(label: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
  return value
}

/** Camera-forward yaw: 0 deg is +Z and +90 deg is +X. */
export function yawDegFromXZ(x: number, z: number): number {
  requireFinite('x', x)
  requireFinite('z', z)
  if (x === 0 && z === 0) throw new RangeError('XZ direction must be non-zero')
  return Math.atan2(x, z) / DEG_TO_RAD
}

/** Raised half-cosine: bright direction=1, perpendicular/opposite half-plane=0. */
export function hazeDirectionLobe(yawDeg: number, brightYawDeg: number): number {
  const delta = (requireFinite('yawDeg', yawDeg) - requireFinite('brightYawDeg', brightYawDeg)) * DEG_TO_RAD
  return Math.max(0, Math.cos(delta))
}

export function hazeDirectionWeight(yawDeg: number, brightYawDeg: number, gain: number): number {
  requireFinite('gain', gain)
  if (gain < 0) throw new RangeError('gain must be non-negative')
  return 1 + gain * hazeDirectionLobe(yawDeg, brightYawDeg)
}

export function directionalHazeMix(
  hazeMix: number,
  yawDeg: number,
  config: Pick<HazeDirectionConfig, 'brightYawDeg' | 'gain'>,
): number {
  requireFinite('hazeMix', hazeMix)
  if (hazeMix < 0 || hazeMix > 1) throw new RangeError('hazeMix must be in [0, 1]')
  return Math.min(1, hazeMix * hazeDirectionWeight(yawDeg, config.brightYawDeg, config.gain))
}

/**
 * Extra luminance attenuation for the opt-in path. The baseline tint normalizes
 * fog luminance to sky luminance, so hazeMix alone cannot dim S3.
 */
export function directionalAttenuation(
  yawDeg: number,
  config: Pick<HazeDirectionConfig, 'brightYawDeg' | 'gain' | 'maxAttenuation'>,
): number {
  requireFinite('maxAttenuation', config.maxAttenuation)
  if (config.maxAttenuation < 0 || config.maxAttenuation >= 1) {
    throw new RangeError('maxAttenuation must be in [0, 1)')
  }
  const weightedGain = hazeDirectionWeight(yawDeg, config.brightYawDeg, config.gain) - 1
  return Math.min(config.maxAttenuation, config.maxAttenuation * weightedGain)
}
