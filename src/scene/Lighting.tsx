/* oxlint-disable react/only-export-components -- smoke probe verifies the constructed shadow light. */
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { DirectionalLight, Vector3 } from 'three'
import { readPlayerFrame } from '../store/playerBridge'
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

/**
 * 2026-08-28 (룩 심사안 #1·#6) — 태양 방향(단위 벡터, 기존 position (48.4,14.6,-48.4) 정규화)과 색온도·강도.
 * 그림자 광원은 매 프레임 플레이어(없으면 원점)를 target 으로 추적한다 — 이전엔 원점 고정 박스라 거대수목(38,-96)·길 끝이 그림자 밖이었다.
 * 스위밍 방지: target 을 그림자 텍셀 크기로 스냅한다.
 */
export const SUN_DIRECTION = new Vector3(48.4, 14.6, -48.4).normalize()
export const SUN_COLOR = '#ffe6c8'
export const SUN_INTENSITY = 2.2
export const SUN_DISTANCE_METERS = 70

export function createShadowLight(): DirectionalLight {
  const light = new DirectionalLight(SUN_COLOR, SUN_INTENSITY)
  light.castShadow = true
  light.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE_METERS)
  applyShadowPreset(light, 'low')
  return light
}

/** 플레이어 위치를 그림자 텍셀 격자에 스냅해 광원·타깃을 옮긴다(순수 계산, 테스트 가능). */
export function trackShadowTarget(light: DirectionalLight, focus: Vector3, out: { target: Vector3; position: Vector3 }): void {
  const halfExtent = light.shadow.camera.right
  const worldPerTexel = (halfExtent * 2) / Math.max(1, light.shadow.mapSize.width)
  out.target.set(
    Math.round(focus.x / worldPerTexel) * worldPerTexel,
    Math.round(focus.y / worldPerTexel) * worldPerTexel,
    Math.round(focus.z / worldPerTexel) * worldPerTexel,
  )
  out.position.copy(out.target).addScaledVector(SUN_DIRECTION, SUN_DISTANCE_METERS)
}

export function Lighting() {
  const preset = useRuntime((state) => state.preset)
  const light = useMemo(() => createShadowLight(), [])
  const scratch = useRef({ target: new Vector3(), position: new Vector3(), focus: new Vector3() })

  useLayoutEffect(() => {
    applyShadowPreset(light, preset)
  }, [light, preset])

  useFrame(() => {
    const frame = readPlayerFrame()
    const s = scratch.current
    if (frame !== null) s.focus.set(frame.position.x, frame.position.y, frame.position.z)
    else s.focus.set(0, 0, 0)
    trackShadowTarget(light, s.focus, s)
    light.target.position.copy(s.target)
    light.position.copy(s.position)
    light.target.updateMatrixWorld()
  })

  return <><primitive object={light} /><primitive object={light.target} /></>
}
