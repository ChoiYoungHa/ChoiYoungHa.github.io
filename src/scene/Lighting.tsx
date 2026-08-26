/* oxlint-disable react/only-export-components -- smoke probe verifies the constructed shadow light. */
import { useMemo } from 'react'
import { DirectionalLight } from 'three'

export const M1_SHADOW_CONFIG = {
  cascades: 1,
  mapSize: 1024,
  distance: 80,
  csmDeferredTo: 'M3',
} as const

export function createShadowLight(): DirectionalLight {
  const light = new DirectionalLight(0xffffff, 1)
  light.castShadow = true
  light.position.set(48.4, 14.6, -48.4)
  light.shadow.mapSize.set(M1_SHADOW_CONFIG.mapSize, M1_SHADOW_CONFIG.mapSize)
  light.shadow.camera.near = 0.1
  light.shadow.camera.far = M1_SHADOW_CONFIG.distance
  light.shadow.camera.left = -40
  light.shadow.camera.right = 40
  light.shadow.camera.top = 40
  light.shadow.camera.bottom = -40
  light.shadow.camera.updateProjectionMatrix()
  return light
}

export function Lighting() {
  const light = useMemo(() => createShadowLight(), [])
  return <primitive object={light} />
}
