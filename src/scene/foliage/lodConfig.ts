import qualityPresets from '../../data/quality-presets.json' with { type: 'json' }

export type LodPresetName = keyof typeof qualityPresets
export type LodDistances = [near: number, middle: number, far: number]

export interface LodConfig {
  coniferLodDistances: LodDistances
  rockLodDistances: LodDistances
  grassInstances: { count: number; radius: number }
  rockInstances: number
}

/** §3-6 instance and LOD values, copied so consumers cannot mutate the JSON SSOT. */
export function lodConfigForPreset(preset: LodPresetName): LodConfig {
  const source = qualityPresets[preset]
  const [near, middle, far] = source.coniferLodDistances
  return {
    coniferLodDistances: [near, middle, far],
    rockLodDistances: [near, middle, far],
    grassInstances: { count: source.grassInstances.count, radius: source.grassInstances.radius },
    rockInstances: source.rockInstances,
  }
}
