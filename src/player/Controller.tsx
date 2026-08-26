import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import mainPath from '../data/main-path.json' with { type: 'json' }
import { sampleGround } from '../scene/terrain/heightmap'
import placement from '../data/placement.json' with { type: 'json' }
import { heroTreeCollider, PLAYER_RADIUS, resolveCollision } from '../scene/colliders/heroTree'
import { resolveVillageCollision } from '../scene/colliders/village'
import { createKeyboardInput } from './input'
import { createRaycastController } from './controllers/raycast'
import { RAYCAST_DEFAULTS, type Vec3 } from './controllers/types'
import { FollowCamera } from './FollowCamera'
import { publishPlayerFrame, readInputSource } from '../store/playerBridge'
import { useLookdevMaterial } from '../scene/Atmosphere'

/**
 * M0a-09 — WASD/Shift · 지면 접지 · 3인칭 카메라.
 * 계획서.md §3-4 구현 A(raycast). **점프·상호작용 없음**(§1-2 제출 후 선택).
 *
 * 상태는 스토어에 넣지 않는다(§3-3). 위치·yaw 는 ref 로만 흐른다.
 */
/**
 * M4-05 (R30-A) — 마우스 감도 배율. Settings 가 바꾸고 드래그 핸들러가 읽는다.
 * 매 프레임 값이 아니라 설정값이라 모듈 변수로 충분하다(스토어 §3-3 규칙과 무관). 영속하지 않는다.
 */
let mouseSensitivity = 1
export function setMouseSensitivity(multiplier: number): void {
  mouseSensitivity = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
}
export function getMouseSensitivity(): number {
  return mouseSensitivity
}

export function Player() {
  const bodyRef = useRef<Mesh>(null)
  // M3-05 (R30-A) — 플레이어 큐브도 같은 거리 그레이딩 재질
  const bodyMaterial = useLookdevMaterial({ color: '#8fa0b0', roughness: 0.6, metalness: 0 })
  const posRef = useRef<Vec3>({ x: 0, y: RAYCAST_DEFAULTS.eyeOffset, z: 0 })
  const yawRef = useRef(0)

  // M1-07 — 접지 샘플러가 절차적 지형이다(M0-a 의 40m 평면 아님).
  // 스폰은 길의 첫 waypoint = 마을 입구(main-path.json landmarks.spawn).
  const controller = useMemo(
    () =>
      createRaycastController(
        sampleGround,
        { x: mainPath.landmarks.spawn.x, y: 0, z: mainPath.landmarks.spawn.z },
        {},
        // M2-10 거대 수목 줄기(원) → M2-27 마을 집 외벽(박스) 순으로 민다.
        // 수목과 마을은 130m 떨어져 있어 한 지점에서 둘 다 걸리는 일이 없다 — 순서가 결과를 바꾸지 않는다.
        // 반경은 heroTree 와 같은 PLAYER_RADIUS(0.4 = 캐릭터 큐브 0.8m 의 반폭)를 쓴다.
        // village.ts 의 기본값 0.35 를 그대로 두면 벽 모서리에 0.05m 파고든다.
        (pos) =>
          resolveVillageCollision(
            resolveCollision(pos, [heroTreeCollider(placement.heroTree)]),
            PLAYER_RADIUS,
          ),
      ),
    [],
  )
  const keys = useMemo(() => createKeyboardInput(), [])

  // 드래그로 시선 회전 (lookX). 포인터락은 M0-a 범위 밖.
  useEffect(() => {
    let dragging = false
    let lastX = 0
    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      yawRef.current -= (e.clientX - lastX) * 0.005 * mouseSensitivity // M4-05 (R30-A) 감도 배율
      lastX = e.clientX
    }
    const up = () => {
      dragging = false
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      keys.dispose()
    }
  }, [keys])

  useFrame((_, rawDt) => {
    // 탭 전환 등으로 튄 dt 는 물리를 깨뜨린다. 상한을 둔다.
    const dt = Math.min(rawDt, 1 / 20)

    // bench 러너가 입력 소스를 걸어두면 키보드 대신 그것을 읽는다.
    // yaw 까지 러너가 주므로 카메라도 동선을 따라간다.
    const source = readInputSource()
    const input = source ? source() : keys.read(yawRef.current)
    if (source) yawRef.current = input.yaw

    const r = controller.step(input, dt)
    posRef.current = r.position
    const body = bodyRef.current
    if (body) {
      body.position.set(r.position.x, r.position.y, r.position.z)
      body.rotation.y = r.heading
    }
    publishPlayerFrame(r, dt)
  })

  return (
    <>
      <mesh ref={bodyRef} position={[0, RAYCAST_DEFAULTS.eyeOffset, 0]} material={bodyMaterial}>
        <boxGeometry args={[0.8, 1.8, 0.8]} />
      </mesh>
      <FollowCamera targetRef={posRef} yawRef={yawRef} />
    </>
  )
}
