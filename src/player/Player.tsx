import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AnimationMixer, Box3, type AnimationAction, type Group, type Mesh } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { useLookdevMaterial } from '../scene/Atmosphere'
import {
  approachAngle,
  blendWeights,
  clipTimeScale,
  IDLE_WEIGHTS,
  RUN_CLIP_SPEED,
  WALK_CLIP_SPEED,
  type LocomotionWeights,
} from './animation'
import { RAYCAST_DEFAULTS } from './controllers/types'

/**
 * M5-11 (R117-A) — 플레이어 아바타. 큐브를 대신해 `char_player.glb` 를 그리고
 * 컨트롤러 속도로 Idle/Walk/Run 을 섞는다(블렌드 규칙은 `animation.ts` 순수 함수).
 *
 * 계약:
 *   · 위치·heading·speed 는 `Controller.tsx` 가 매 프레임 `frameRef` 에 쓴다(스토어 금지, 계획서 §3-3).
 *   · GLB 는 **키 1.8m 로 정규화**해 큐브와 같은 크기를 유지한다 —
 *     콜라이더 `PLAYER_RADIUS`·카메라 `CAMERA.height` 상수를 건드리지 않기 위해서다.
 *   · 원점이 발이므로 `y - eyeOffset`(= 지면)에 놓는다. 큐브는 중심이 원점이라 오프셋이 달랐다.
 *   · 재질은 GLB 것을 그대로 쓴다(재질 추가 0). castShadow on / receiveShadow off.
 *   · GLB 가 없거나 로드에 실패하면 기존 큐브로 폴백한다(Suspense + 에러 경계).
 */

export const PLAYER_MODEL_URL = '/models/char_player.glb'
/** 큐브(0.8×1.8×0.8)와 같은 키. GLB 원본 단위와 무관하게 이 높이로 맞춘다. */
export const PLAYER_HEIGHT_METERS = 1.8

export interface PlayerAvatarFrame {
  x: number
  y: number
  z: number
  /** 이동 방향(라디안). 컨트롤러가 이동 중에만 갱신한다. */
  heading: number
  /** 수평 속도(m/s). */
  speed: number
}

interface AvatarProps {
  frameRef: React.RefObject<PlayerAvatarFrame>
}

/** 기존 회색 큐브. GLB 폴백 전용이라 형태·재질을 그대로 둔다(M3-05 거리 그레이딩 재질). */
function PlayerCube({ frameRef }: AvatarProps) {
  const meshRef = useRef<Mesh>(null)
  const material = useLookdevMaterial({ color: '#8fa0b0', roughness: 0.6, metalness: 0 })

  useFrame(() => {
    const mesh = meshRef.current
    const frame = frameRef.current
    if (mesh === null || frame === null) return
    mesh.position.set(frame.x, frame.y, frame.z)
    mesh.rotation.y = frame.heading
  })

  return (
    <mesh ref={meshRef} name="player" position={[0, RAYCAST_DEFAULTS.eyeOffset, 0]} material={material}>
      <boxGeometry args={[0.8, 1.8, 0.8]} />
    </mesh>
  )
}

function AvatarModel({ frameRef }: AvatarProps) {
  const groupRef = useRef<Group>(null)
  const yawRef = useRef(0)
  const weightsRef = useRef<LocomotionWeights>({ ...IDLE_WEIGHTS })
  const { scene, animations } = useGLTF(PLAYER_MODEL_URL)

  // useGLTF 캐시를 직접 변형하지 않는다. 스킨 메시는 SkeletonUtils.clone 만 본 바인딩을 보존한다.
  const model = useMemo(() => {
    const object = cloneSkeleton(scene)
    object.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(object)
    const height = bounds.max.y - bounds.min.y
    const scale = height > 0 ? PLAYER_HEIGHT_METERS / height : 1
    object.scale.setScalar(scale)
    object.position.y = -bounds.min.y * scale // 발바닥을 그룹 원점에 붙인다
    object.traverse((child) => {
      const mesh = child as Mesh
      if (mesh.isMesh !== true) return
      mesh.castShadow = true
      mesh.receiveShadow = false
      // 스킨 메시의 bounding 은 바인드 포즈 기준이라 애니메이션 중 오컬전 판정이 어긋난다.
      mesh.frustumCulled = false
    })
    return { object, scale, sourceHeight: height }
  }, [scene])

  const mixer = useMemo(() => new AnimationMixer(model.object), [model.object])

  const actions = useMemo(() => {
    const pick = (name: string): AnimationAction | null => {
      const clip = animations.find((candidate) => candidate.name.toLowerCase() === name)
      if (clip === undefined) return null
      const action = mixer.clipAction(clip)
      action.enabled = true
      action.setEffectiveWeight(0)
      action.play() // 셋 다 재생해 두고 가중치로만 섞는다 — 전환 시 재생 위치가 튀지 않는다
      return action
    }
    return { idle: pick('idle'), walk: pick('walk'), run: pick('run') }
  }, [animations, mixer])

  useEffect(() => {
    const root = model.object
    return () => {
      mixer.stopAllAction()
      mixer.uncacheRoot(root)
    }
  }, [mixer, model.object])

  useFrame((_, rawDt) => {
    const group = groupRef.current
    const frame = frameRef.current
    if (group === null || frame === null) return
    const dt = Math.min(rawDt, 1 / 20)

    group.position.set(frame.x, frame.y - RAYCAST_DEFAULTS.eyeOffset, frame.z)
    yawRef.current = approachAngle(yawRef.current, frame.heading, dt)
    group.rotation.y = yawRef.current

    const weights = blendWeights(weightsRef.current, frame.speed, dt)
    weightsRef.current = weights
    actions.idle?.setEffectiveWeight(weights.idle)
    if (actions.walk !== null) {
      actions.walk.setEffectiveWeight(weights.walk)
      actions.walk.setEffectiveTimeScale(clipTimeScale(frame.speed, WALK_CLIP_SPEED))
    }
    if (actions.run !== null) {
      actions.run.setEffectiveWeight(weights.run)
      actions.run.setEffectiveTimeScale(clipTimeScale(frame.speed, RUN_CLIP_SPEED))
    }
    mixer.update(dt)
  })

  return (
    <group ref={groupRef} name="player">
      <primitive object={model.object} />
    </group>
  )
}

/** GLB 로드 실패(404·파싱 오류)를 큐브로 흡수한다. Suspense 는 로딩만 다루므로 별도로 필요하다. */
class AvatarBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function PlayerAvatar({ frameRef }: AvatarProps) {
  const cube = <PlayerCube frameRef={frameRef} />
  return (
    <AvatarBoundary fallback={cube}>
      <Suspense fallback={cube}>
        <AvatarModel frameRef={frameRef} />
      </Suspense>
    </AvatarBoundary>
  )
}
