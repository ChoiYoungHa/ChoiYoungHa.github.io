import qualityPresets from '../data/quality-presets.json' with { type: 'json' }

export type TexturePresetName = keyof typeof qualityPresets
export type TextureTier = '1K' | '2K'

export interface TextureConfig {
  anisotropy: number
  textureTier: { default: TextureTier; hero: TextureTier }
}

/** §3-6 sampler and asset-tier contract; actual texture mutation remains an integration step. */
export function textureConfigForPreset(preset: TexturePresetName): TextureConfig {
  const source = qualityPresets[preset]
  return {
    anisotropy: source.anisotropy,
    textureTier: {
      default: source.textureTier.default as TextureTier,
      hero: source.textureTier.hero as TextureTier,
    },
  }
}
