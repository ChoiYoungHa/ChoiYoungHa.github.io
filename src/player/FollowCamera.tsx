import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import type { Vec3 } from './controllers/types'

/**
 * 계획서.md §3-4 팔로우 카메라.
 * drei OrbitControls 는 쓰지 않는다 — 플레이어 추종이 아니다.
 */
export const CAMERA = {
  fov: 55,
  distance: 6.0,
  height: 2.2,
  pitchDeg: -12,
  posDamp: 0.12,
  lookDamp: 0.2,
  near: 0.1,
  far: 400,
} as const

interface Props {
  /** 매 프레임 갱신되는 대상 위치. 리렌더를 피하려고 ref 로 받는다(§3-3). */
  targetRef: React.RefObject<Vec3>
  yawRef: React.RefObject<number>
}

export function FollowCamera({ targetRef, yawRef }: Props) {
  const { camera } = useThree()
  const desired = useRef(new Vector3())
  const lookAt = useRef(new Vector3())
  const smoothLook = useRef(new Vector3())
  const inited = useRef(false)

  useFrame((_, dt) => {
    const t = targetRef.current
    if (!t) return
    const yaw = yawRef.current ?? 0

    // 카메라는 yaw 기준 뒤쪽으로 distance, 위로 height. pitch 만큼 더 올라간다.
    const pitch = (-CAMERA.pitchDeg * Math.PI) / 180 // -12° 내려다봄 = 12° 위로 올림
    const back = CAMERA.distance * Math.cos(pitch)
    const up = CAMERA.distance * Math.sin(pitch)
    desired.current.set(
      t.x + Math.sin(yaw) * back,
      t.y + CAMERA.height + up,
      t.z + Math.cos(yaw) * back,
    )
    lookAt.current.set(t.x, t.y + 0.6, t.z)

    // 지수 감쇠를 프레임레이트 독립으로 (dt 보정)
    const a = 1 - Math.pow(1 - CAMERA.posDamp, dt * 60)
    const b = 1 - Math.pow(1 - CAMERA.lookDamp, dt * 60)

    if (!inited.current) {
      camera.position.copy(desired.current)
      smoothLook.current.copy(lookAt.current)
      inited.current = true
    } else {
      camera.position.lerp(desired.current, a)
      smoothLook.current.lerp(lookAt.current, b)
    }
    camera.lookAt(smoothLook.current)
  })

  return null
}
