import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { AnimationMixer, Box3, Bone, Object3D, Quaternion, Vector3, type AnimationAction, type Group, type Mesh, LoopOnce } from 'three'
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
import { useGame } from '../store/useGame'

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
/** 강철검(콘티 wpn-sword-steel → Higgsfield 3D, Blender 정규화: 날 +Y·손잡이 끝 원점·길이 1.0m). 오른손 본에 장착. */
export const PLAYER_WEAPON_URL = '/models/wpn_sword_steel.glb'
/** 2026-08-28 (영하님): 장착 아이템 id → 3D 모델. 나무검은 코덱스 시트 B(`3d-codex/weapons`, 손잡이 끝 원점·날 +Y·1.016m). 미등록 id 는 강철검. */
export const WEAPON_MODEL_URLS: Record<string, string> = {
  'weapon.wooden-sword': '/models/weapons/wpn-sword-wooden.glb',
  'weapon.steel-sword': PLAYER_WEAPON_URL,
}
export function weaponModelUrl(itemId: string | null): string {
  return itemId === null ? PLAYER_WEAPON_URL : WEAPON_MODEL_URLS[itemId] ?? PLAYER_WEAPON_URL
}
export const WEAPON_HAND_BONE = 'RightHand'
/** 손잡이 끝에서 손바닥 중심까지 거리(m). 검을 손 안쪽으로 이만큼 밀어 넣는다. */
export const WEAPON_GRIP_OFFSET = 0.12
export const WEAPON_SCALE = 0.9
/** 큐브(0.8×1.8×0.8)와 같은 키. GLB 원본 단위와 무관하게 이 높이로 맞춘다. */
export const PLAYER_HEIGHT_METERS = 1.8
/** attack 클립(2.83s)은 기본공격 쿨다운(0.6s)보다 길어 빠르게 돌린다. */
export const ATTACK_CLIP_TIMESCALE = 2.5
/** Meshy 리깅본은 정면이 +Z 다(three 캐릭터 규약은 -Z). 걷는 뒷모습이 보이도록 180° 보정한다(2026-08-27 영하님 피드백). */
export const MODEL_YAW_OFFSET = Math.PI
/** 스킬 클립(Skill_01)은 3.5s 쿨다운에 맞춰 약간 빠르게. */
export const SKILL_CLIP_TIMESCALE = 1.4

export interface PlayerAvatarFrame {
  x: number
  y: number
  z: number
  /** 이동 방향(라디안). 컨트롤러가 이동 중에만 갱신한다. */
  heading: number
  /** 수평 속도(m/s). */
  speed: number
  /** 카메라 yaw(라디안). 이동 중 아바타는 이 방향을 바라본다 — 3인칭 뒷모습 보장(2026-08-27 영하님). */
  cameraYaw: number
  /** 후진 입력 중(카메라 정면과 속도가 반대). 걷기/달리기 클립을 역재생한다. */
  backward: boolean
  /** 접지 여부. false 면 jump 클립. */
  grounded: boolean
  /** 기본공격 edge 카운터. 값이 바뀌면 attack 클립을 1회 재생한다. */
  attackSeq: number
  /** 스킬 edge 카운터. 값이 바뀌면 skill 클립을 1회 재생한다. */
  skillSeq: number
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

  const equippedWeaponId = useGame((state) => state.equipment.weapon)
  const weapon = useGLTF(weaponModelUrl(equippedWeaponId))
  // 검을 오른손 본에 부착한다. 날 방향은 아래팔→손 방향(본 로컬 기준)으로 맞춰 리그 축 규약에 의존하지 않는다.
  useEffect(() => {
    const hand = model.object.getObjectByName(WEAPON_HAND_BONE)
    if (!(hand instanceof Bone)) return
    const forearm = hand.parent
    const holder = new Object3D()
    holder.name = 'weapon-holder'
    const sword = weapon.scene.clone(true)
    sword.name = `weapon-${equippedWeaponId ?? 'default'}`
    sword.traverse((child) => { const mesh = child as Mesh; if (mesh.isMesh === true) { mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false } })
    // 부모(아래팔) 위치를 손 로컬로 옮기면 "손목→손" 방향이 나온다. 날은 그 반대(손 밖)로 뻗는다.
    const wristLocal = forearm !== null ? hand.worldToLocal(forearm.getWorldPosition(new Vector3())) : new Vector3(0, -1, 0)
    const bladeDir = wristLocal.clone().multiplyScalar(-1).normalize()
    holder.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), bladeDir))
    // 본 스케일(Armature 0.01 등)이 검에 곱해지므로 상쇄한다.
    // 손 본의 월드 스케일(Armature 0.01 × 그룹 정규화)을 상쇄해 검이 월드 기준 WEAPON_SCALE(m) 이 되게 한다.
    model.object.updateMatrixWorld(true)
    const boneScale = hand.getWorldScale(new Vector3())
    holder.scale.setScalar(WEAPON_SCALE / (boneScale.x || 1))
    holder.position.copy(bladeDir.clone().multiplyScalar(-WEAPON_GRIP_OFFSET / (boneScale.x || 1)))
    holder.add(sword)
    hand.add(holder)
    return () => { hand.remove(holder) }
  }, [model.object, model.scale, weapon.scene, equippedWeaponId])

  const mixer = useMemo(() => new AnimationMixer(model.object), [model.object])

  type AvatarActions = { idle: AnimationAction | null; walk: AnimationAction | null; run: AnimationAction | null; attack: AnimationAction | null; skill: AnimationAction | null; jump: AnimationAction | null }
  const actionsRef = useRef<AvatarActions>({ idle: null, walk: null, run: null, attack: null, skill: null, jump: null })
  const attackSeqRef = useRef(0)
  const skillSeqRef = useRef(0)
  const jumpingRef = useRef(false)

  // StrictMode(dev)는 effect를 mount→cleanup→mount 로 두 번 돌리고 cleanup 이 mixer 캐시를 비운다.
  // 액션은 반드시 effect 안에서 만들어야 두 번째 mount 에서 살아난다(memo 액션 재사용 → _lendBinding 크래시).
  useEffect(() => {
    const root = model.object
    const find = (name: string) => animations.find((candidate) => candidate.name.toLowerCase() === name)
    const pick = (name: string): AnimationAction | null => {
      const clip = find(name)
      if (clip === undefined) return null
      const action = mixer.clipAction(clip)
      action.enabled = true
      action.setEffectiveWeight(0)
      action.reset().play() // 셋 다 재생해 두고 가중치로만 섞는다 — 전환 시 재생 위치가 튀지 않는다
      return action
    }
    const pickOneShot = (name: string): AnimationAction | null => {
      const clip = find(name)
      if (clip === undefined) return null
      const action = mixer.clipAction(clip)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = false
      action.enabled = true
      action.setEffectiveWeight(0)
      return action
    }
    actionsRef.current = { idle: pick('idle'), walk: pick('walk'), run: pick('run'), attack: pickOneShot('attack'), skill: pickOneShot('skill'), jump: pickOneShot('jump') }
    jumpingRef.current = false
    return () => {
      actionsRef.current = { idle: null, walk: null, run: null, attack: null, skill: null, jump: null }
      mixer.stopAllAction()
      mixer.uncacheRoot(root)
    }
  }, [animations, mixer, model.object])

  useFrame((_, rawDt) => {
    const group = groupRef.current
    const frame = frameRef.current
    if (group === null || frame === null) return
    const dt = Math.min(rawDt, 1 / 20)
    const actions = actionsRef.current

    group.position.set(frame.x, frame.y - RAYCAST_DEFAULTS.eyeOffset, frame.z)
    // 이동 중에는 속도 방향이 아니라 카메라 정면을 본다(후진도 정면 유지 + 클립 역재생). 정지 시엔 마지막 방향 유지.
    // 컨트롤러 heading 규약: forwardFromYaw(yaw)=(-sin,-cos) → heading = -yaw.
    // 카메라 정면 = forwardFromYaw(yaw) = (-sin yaw, -cos yaw). 모델(+Z 정면)을 yaw+π 로 돌리면 (-sin, -cos) — 부호 실수(-yaw)였던 것을 정정(2026-08-27).
    if (frame.speed > 0.05) yawRef.current = approachAngle(yawRef.current, frame.cameraYaw, dt)
    group.rotation.y = yawRef.current + MODEL_YAW_OFFSET

    // one-shot: 공격(edge 카운터)·점프(비접지). 재생 중엔 이동 클립을 눌러 섞임을 막는다.
    if (actions.attack !== null && frame.attackSeq !== attackSeqRef.current) {
      attackSeqRef.current = frame.attackSeq
      actions.attack.reset().setEffectiveWeight(1).setEffectiveTimeScale(ATTACK_CLIP_TIMESCALE).play()
    }
    if (frame.skillSeq !== skillSeqRef.current) {
      skillSeqRef.current = frame.skillSeq
      // 스킬 클립이 아직 없으면 공격 클립으로 대신한다(클립 도착 전 폴백).
      const clip = actions.skill ?? actions.attack
      clip?.reset().setEffectiveWeight(1).setEffectiveTimeScale(actions.skill !== null ? SKILL_CLIP_TIMESCALE : ATTACK_CLIP_TIMESCALE).play()
    }
    if (actions.jump !== null) {
      if (!frame.grounded && !jumpingRef.current) {
        jumpingRef.current = true
        actions.jump.reset().setEffectiveWeight(1).play()
      } else if (frame.grounded && jumpingRef.current) {
        jumpingRef.current = false
        actions.jump.fadeOut(0.15)
      }
    }
    const attackActive = (actions.attack !== null && actions.attack.isRunning()) || (actions.skill !== null && actions.skill.isRunning())
    const jumpActive = actions.jump !== null && actions.jump.isRunning()
    const locomotion = attackActive || jumpActive ? 0.15 : 1

    const weights = blendWeights(weightsRef.current, frame.speed, dt)
    weightsRef.current = weights
    actions.idle?.setEffectiveWeight(weights.idle * locomotion)
    if (actions.walk !== null) {
      actions.walk.setEffectiveWeight(weights.walk * locomotion)
      actions.walk.setEffectiveTimeScale(clipTimeScale(frame.speed, WALK_CLIP_SPEED) * (frame.backward ? -1 : 1))
    }
    if (actions.run !== null) {
      actions.run.setEffectiveWeight(weights.run * locomotion)
      actions.run.setEffectiveTimeScale(clipTimeScale(frame.speed, RUN_CLIP_SPEED) * (frame.backward ? -1 : 1))
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
