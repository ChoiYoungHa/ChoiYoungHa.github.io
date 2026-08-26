/* oxlint-disable react/only-export-components -- smoke probe reuses the component's loader contract. */
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { EquirectangularReflectionMapping, type Scene, type Texture } from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'

export const SKY_HDR_URL = '/env/sky_1k.hdr'

export async function loadSkyTexture(url = SKY_HDR_URL): Promise<Texture> {
  const texture = await new RGBELoader().loadAsync(url)
  texture.mapping = EquirectangularReflectionMapping
  return texture
}

export function applySkyTexture(scene: Scene, texture: Texture): void {
  scene.background = texture
  scene.environment = texture
}

export function SkyDome() {
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const previousBackground = scene.background
    const previousEnvironment = scene.environment
    let active = true
    let sky: Texture | undefined

    void loadSkyTexture()
      .then((texture) => {
        if (!active) {
          texture.dispose()
          return
        }
        sky = texture
        applySkyTexture(scene, texture)
      })
      .catch((error: unknown) => console.error('HDR sky load failed', error))

    return () => {
      active = false
      if (scene.background === sky) scene.background = previousBackground
      if (scene.environment === sky) scene.environment = previousEnvironment
      sky?.dispose()
    }
  }, [scene])

  return null
}
