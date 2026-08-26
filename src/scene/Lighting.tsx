/* oxlint-disable react/only-export-components -- smoke probe verifies the constructed shadow light. */
import { useLayoutEffect, useMemo } from 'react'
import { DirectionalLight } from 'three'
import { useRuntime } from '../store/useRuntime'
import { shadowConfigForPreset, type ShadowPresetName } from './shadows/shadowConfig'

export const M1_SHADOW_CONFIG = {
  cascades: 1,
  mapSize: 1024,
  distance: 80,
  csmDeferredTo: 'M3',
} as const

/** Apply the selected preset to the single-shadow WebGPU fallback. */
export function applyShadowPreset(light: DirectionalLight, preset: ShadowPresetName): void {
  const shadow = shadowConfigForPreset(preset)
  if (shadow.lightCount !== 1 || shadow.fallback.activeCascades !== 1) {
    throw new Error('The current shadow fallback requires exactly one shadow light and map.')
  }

  const halfExtent = shadow.fallback.frustumHalfExtent
  const mapSizeChanged = light.shadow.mapSize.width !== shadow.mapSize
  light.shadow.mapSize.set(shadow.mapSize, shadow.mapSize)
  light.shadow.camera.near = shadow.fallback.cameraNear
  light.shadow.camera.far = shadow.maxDistance
  light.shadow.camera.left = -halfExtent
  light.shadow.camera.right = halfExtent
  light.shadow.camera.top = halfExtent
  light.shadow.camera.bottom = -halfExtent
  light.shadow.bias = shadow.bias
  light.shadow.normalBias = shadow.normalBias
  light.shadow.camera.updateProjectionMatrix()

  // A rendered shadow map must be recreated when its dimensions change.
  if (mapSizeChanged && light.shadow.map !== null) {
    light.shadow.map.dispose()
    light.shadow.map = null
  }
  light.userData.shadowPreset = {
    requestedCascades: shadow.cascades,
    activeCascades: shadow.fallback.activeCascades,
    lightCount: shadow.lightCount,
    strategy: shadow.strategy,
  }
}

export function createShadowLight(): DirectionalLight {
  const light = new DirectionalLight(0xffffff, 1)
  light.castShadow = true
  light.position.set(48.4, 14.6, -48.4)
  applyShadowPreset(light, 'low')
  return light
}

export function Lighting() {
  const preset = useRuntime((state) => state.preset)
  const light = useMemo(() => createShadowLight(), [])

  useLayoutEffect(() => {
    applyShadowPreset(light, preset)
  }, [light, preset])

  return <primitive object={light} />
}
