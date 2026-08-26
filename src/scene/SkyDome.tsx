/* oxlint-disable react/only-export-components -- smoke probe reuses the component's loader contract. */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, EquirectangularReflectionMapping, type Scene, type Texture, Vector3 } from 'three'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { clamp, cos, equirectUV, float, luminance, max, min, mix, positionWorldDirection, texture, uniform, vec3, vec4 } from 'three/tsl'
import lookdev from '../data/lookdev.json'
import { FOG_COLOR } from './Atmosphere'
import { yawDegFromXZ } from './sky/hazeDirection'

export const SKY_HDR_URL = '/env/sky_1k.hdr'
/** R77-A(M5-12) — `?sky=2k` 이면 2K HDRI(public/env/sky_2k.hdr, 비교용). 기본은 1K 유지. */
export const SKY_HDR_2K_URL = '/env/sky_2k.hdr'
export function readSkyHdrUrl(search: string = location.search): string {
  return new URLSearchParams(search).get('sky') === '2k' ? SKY_HDR_2K_URL : SKY_HDR_URL
}

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

/** Opt-in only: the frozen lookdev default remains off; `?hazeDir=1` enables capture tuning. */
export function readHazeDirectionEnabled(search: string = location.search): boolean {
  const query = new URLSearchParams(search).get('hazeDir')
  if (query === '1') return true
  if (query === '0') return false
  return lookdev.sky.hazeDirection.enabled
}

type SceneWithBackgroundNode = Scene & { backgroundNode: unknown }

/**
 * M3-05E 하늘 접합 (R30-A) — 계획서 §6-2 "안개색 = 하늘 지평 색". HDR 하늘은 채도 2%·hue 220° 라 L1·L2 원경 목표
 * (8~12%·205~215°)에 못 든다. three 의 배경은 어차피 NodeMaterial 구(Background.js)라 `scene.backgroundNode` 로
 * 같은 프로그램 안에서 안개색 쪽으로 섞는다(프로그램 수 불변). 휘도는 보존하고(안개색을 하늘 휘도에 맞춰 스케일) 색만 옮긴다.
 */
export function applySkyTexture(
  scene: Scene,
  sky: Texture,
  cameraYawRadians = uniform(0),
  hazeDirectionEnabled = uniform(0),
): void {
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
    const brightYawRadians = lookdev.sky.hazeDirection.brightYawDeg * Math.PI / 180
    const directionLobe = max(0, cos(cameraYawRadians.sub(brightYawRadians))).mul(hazeDirectionEnabled)
    const weightedGain = directionLobe.mul(lookdev.sky.hazeDirection.gain)
    const weightedMix = clamp(float(k).mul(float(1).add(weightedGain)), 0, 1)
    const attenuation = min(lookdev.sky.hazeDirection.maxAttenuation, weightedGain.mul(lookdev.sky.hazeDirection.maxAttenuation))
    const luminanceScale = float(1).sub(attenuation)
    scene.background = null
    ;(scene as SceneWithBackgroundNode).backgroundNode = vec4(mix(skyRgb, tinted, weightedMix).mul(luminanceScale), 1.0)
  }
  // M3 (R30-A) — 하늘 휘도(L3 far)와 IBL 강도(근경 휘도)를 분리해서 잡는다. 이전엔 둘 다 기본값 1.
  scene.backgroundIntensity = readSkyIntensity('background')
  scene.environmentIntensity = readSkyIntensity('environment')
}

export function SkyDome() {
  const scene = useThree((state) => state.scene)
  const cameraYawRadians = useMemo(() => uniform(0), [])
  const cameraForward = useMemo(() => new Vector3(), [])
  const hazeDirectionEnabled = readHazeDirectionEnabled()
  const hazeDirectionEnabledNode = useMemo(() => uniform(hazeDirectionEnabled ? 1 : 0), [hazeDirectionEnabled])

  useFrame(({ camera }) => {
    if (!hazeDirectionEnabled) return
    camera.getWorldDirection(cameraForward)
    if (Math.hypot(cameraForward.x, cameraForward.z) < 1e-8) return
    cameraYawRadians.value = yawDegFromXZ(cameraForward.x, cameraForward.z) * Math.PI / 180
  })

  useEffect(() => {
    const previousBackground = scene.background
    const previousEnvironment = scene.environment
    let active = true
    let sky: Texture | undefined

    void loadSkyTexture(readSkyHdrUrl())
      .then((texture) => {
        if (!active) {
          texture.dispose()
          return
        }
        sky = texture
        applySkyTexture(scene, texture, cameraYawRadians, hazeDirectionEnabledNode)
      })
      .catch((error: unknown) => console.error('HDR sky load failed', error))

    return () => {
      active = false
      ;(scene as SceneWithBackgroundNode).backgroundNode = null
      if (scene.background === sky) scene.background = previousBackground
      if (scene.environment === sky) scene.environment = previousEnvironment
      sky?.dispose()
    }
  }, [cameraYawRadians, hazeDirectionEnabledNode, scene])

  return null
}
