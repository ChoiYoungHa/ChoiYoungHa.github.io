import qualityPresets from '../../data/quality-presets.json' with { type: 'json' }

export type ShadowPresetName = keyof typeof qualityPresets

export interface ShadowFallbackConfig {
  activeCascades: 1
  mapSize: number
  cameraNear: number
  cameraFar: number
  frustumHalfExtent: number
}

export interface ShadowConfig {
  /** §3-6 target metadata. The selected runtime fallback uses one active map. */
  cascades: number
  mapSize: number
  maxDistance: number
  bias: number
  normalBias: number
  lightCount: 1
  strategy: 'single-shadow-frustum-fallback'
  fallback: ShadowFallbackConfig
}

/**
 * M3-10 preset contract without a renderer dependency.
 *
 * three r185 `CSM.js` is WebGLRenderer-only. Until the WebGPU-native
 * CSMShadowNode integration is coordinated, keep one shadow light and scale
 * its map/frustum with the preset. bias values preserve LightShadow defaults.
 */
export function shadowConfigForPreset(preset: ShadowPresetName): ShadowConfig {
  const source = qualityPresets[preset]
  const mapSize = source.shadowCascades.resolution
  const maxDistance = source.shadowMaxDistance
  return {
    cascades: source.shadowCascades.count,
    mapSize,
    maxDistance,
    bias: 0,
    normalBias: 0,
    lightCount: 1,
    strategy: 'single-shadow-frustum-fallback',
    fallback: {
      activeCascades: 1,
      mapSize,
      cameraNear: 0.1,
      cameraFar: maxDistance,
      frustumHalfExtent: maxDistance / 2,
    },
  }
}
