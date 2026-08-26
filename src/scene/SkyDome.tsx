/* oxlint-disable react/only-export-components -- smoke probe reuses the component's loader contract. */
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Color, EquirectangularReflectionMapping, type Scene, type Texture } from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { equirectUV, float, luminance, mix, positionWorldDirection, texture, vec3, vec4 } from 'three/tsl'
import lookdev from '../data/lookdev.json'
import { FOG_COLOR } from './Atmosphere'

export const SKY_HDR_URL = '/env/sky_1k.hdr'

export async function loadSkyTexture(url = SKY_HDR_URL): Promise<Texture> {
  const texture = await new RGBELoader().loadAsync(url)
  texture.mapping = EquirectangularReflectionMapping
  return texture
}

/** M3 (R30-A) — `?bgi=`·`?envi=` 쿼리가 유한한 0 이상이면 그것, 없으면 lookdev.json 값. */
export function readSkyIntensity(key: 'background' | 'environment', search: string = location.search): number {
  const raw = new URLSearchParams(search).get(key === 'background' ? 'bgi' : 'envi')
  const q = raw === null || raw === '' ? Number.NaN : Number(raw) // Number(null) 은 0 이라 명시적으로 거른다
  if (Number.isFinite(q) && q >= 0) return q
  return key === 'background' ? lookdev.sky.backgroundIntensity : lookdev.sky.environmentIntensity
}

/** `?skymix=0~1` — 하늘을 안개색(#8FA0B0) 쪽으로 섞는 비율. 0 이면 HDR 원본. 기본 lookdev.json. */
export function readSkyMix(search: string = location.search): number {
  const raw = new URLSearchParams(search).get('skymix')
  const q = raw === null || raw === '' ? Number.NaN : Number(raw)
  return Number.isFinite(q) && q >= 0 && q <= 1 ? q : lookdev.sky.hazeMix
}

type SceneWithBackgroundNode = Scene & { backgroundNode: unknown }

/**
 * M3-05E 하늘 접합 (R30-A) — 계획서 §6-2 "안개색 = 하늘 지평 색". HDR 하늘은 채도 2%·hue 220° 라 L1·L2 원경 목표
 * (8~12%·205~215°)에 못 든다. three 의 배경은 어차피 NodeMaterial 구(Background.js)라 `scene.backgroundNode` 로
 * 같은 프로그램 안에서 안개색 쪽으로 섞는다(프로그램 수 불변). 휘도는 보존하고(안개색을 하늘 휘도에 맞춰 스케일) 색만 옮긴다.
 */
export function applySkyTexture(scene: Scene, sky: Texture): void {
  scene.environment = sky
  const k = readSkyMix()
  if (k <= 0) {
    scene.background = sky
    ;(scene as SceneWithBackgroundNode).backgroundNode = null
  } else {
    const skyRgb = texture(sky, equirectUV(positionWorldDirection)).rgb
    const fog = new Color(FOG_COLOR)
    const haze = vec3(fog.r, fog.g, fog.b)
    const tinted = haze.mul(luminance(skyRgb).div(luminance(haze)))
    scene.background = null
    ;(scene as SceneWithBackgroundNode).backgroundNode = vec4(mix(skyRgb, tinted, float(k)), 1.0)
  }
  // M3 (R30-A) — 하늘 휘도(L3 far)와 IBL 강도(근경 휘도)를 분리해서 잡는다. 이전엔 둘 다 기본값 1.
  scene.backgroundIntensity = readSkyIntensity('background')
  scene.environmentIntensity = readSkyIntensity('environment')
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
      ;(scene as SceneWithBackgroundNode).backgroundNode = null
      if (scene.background === sky) scene.background = previousBackground
      if (scene.environment === sky) scene.environment = previousEnvironment
      sky?.dispose()
    }
  }, [scene])

  return null
}
