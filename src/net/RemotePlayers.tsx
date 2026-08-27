import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AnimationMixer, CanvasTexture, LoopOnce, Sprite, SpriteMaterial, type AnimationAction, type Group, type Object3D } from 'three'
import { blendWeights, clipTimeScale, IDLE_WEIGHTS, RUN_CLIP_SPEED, WALK_CLIP_SPEED, type LocomotionWeights } from '../player/animation'
import { ATTACK_CLIP_TIMESCALE, mountWeapon, PLAYER_MODEL_URL, prepareAvatarModel, SKILL_CLIP_TIMESCALE, weaponModelUrl } from '../player/Player'
import { readPlayerFrame } from '../store/playerBridge'
import { RAYCAST_DEFAULTS } from '../player/controllers/types'
import { readPlayerAttackSeq, readPlayerSkillSeq } from '../game/runtimeSignals'
import { useGame } from '../store/useGame'
import { ensureRoom, getRoom, useRoomSnapshot } from './roomStore'
import { interpolatePose, STATE_INTERVAL_MS, type PlayerPose, type RemotePlayer } from './protocol'

/**
 * 2026-08-28 (master) — 멀티플레이 원격 아바타 + 자기 상태 발행.
 *   · 발행: 매 STATE_INTERVAL_MS 마다 로컬 `player` 그룹의 위치·회전(모델 보정 포함)과 프레임 속도·접지·공격/스킬 edge 를 보낸다.
 *   · 표시: 원격마다 char_player.glb 복제(prepareAvatarModel) + 같은 클립 블렌딩 + 무기 + 이름표(스프라이트).
 *   · 충돌 없음(서로 통과). 몬스터·드롭은 로컬(protocol.ts 머리말).
 */

function makeNameSprite(name: string): Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx !== null) {
    ctx.fillStyle = 'rgba(10,12,16,0.65)'
    ctx.beginPath()
    ctx.roundRect(8, 8, 240, 48, 12)
    ctx.fill()
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#f4f1e6'
    ctx.fillText(name, 128, 33)
  }
  const texture = new CanvasTexture(canvas)
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(1.4, 0.35, 1)
  sprite.position.y = 2.15
  sprite.name = 'nameplate'
  return sprite
}

function RemoteAvatar({ remote }: { remote: RemotePlayer }) {
  const groupRef = useRef<Group>(null)
  const { scene, animations } = useGLTF(PLAYER_MODEL_URL)
  const weapon = useGLTF(weaponModelUrl(remote.who.weapon))
  const model = useMemo(() => prepareAvatarModel(scene), [scene])
  const mixer = useMemo(() => new AnimationMixer(model.object), [model.object])
  const weightsRef = useRef<LocomotionWeights>({ ...IDLE_WEIGHTS })
  const actionsRef = useRef<{ idle: AnimationAction | null; walk: AnimationAction | null; run: AnimationAction | null; attack: AnimationAction | null; skill: AnimationAction | null }>({ idle: null, walk: null, run: null, attack: null, skill: null })
  const seqRef = useRef({ attack: -1, skill: -1 })

  useEffect(() => mountWeapon(model.object, weapon.scene, `remote-weapon-${remote.who.weapon ?? 'default'}`), [model.object, weapon.scene, remote.who.weapon])

  useEffect(() => {
    const group = groupRef.current
    const sprite = makeNameSprite(remote.who.name)
    group?.add(sprite)
    return () => { group?.remove(sprite); sprite.material.map?.dispose(); sprite.material.dispose() }
  }, [remote.who.name])

  useEffect(() => {
    const find = (name: string) => animations.find((c) => c.name.toLowerCase() === name)
    const loop = (name: string) => { const clip = find(name); if (!clip) return null; const a = mixer.clipAction(clip); a.enabled = true; a.setEffectiveWeight(0); a.reset().play(); return a }
    const once = (name: string) => { const clip = find(name); if (!clip) return null; const a = mixer.clipAction(clip); a.setLoop(LoopOnce, 1); a.enabled = true; a.setEffectiveWeight(0); return a }
    actionsRef.current = { idle: loop('idle'), walk: loop('walk'), run: loop('run'), attack: once('attack'), skill: once('skill') }
    return () => { actionsRef.current = { idle: null, walk: null, run: null, attack: null, skill: null }; mixer.stopAllAction(); mixer.uncacheRoot(model.object) }
  }, [animations, mixer, model.object])

  useFrame((_, rawDt) => {
    const group = groupRef.current
    if (group === null) return
    const dt = Math.min(rawDt, 1 / 20)
    const pose = interpolatePose(remote.samples, Date.now())
    if (pose === null) { group.visible = false; return }
    group.visible = true
    group.position.set(pose.x, pose.y, pose.z)
    group.rotation.y = pose.rotY
    const actions = actionsRef.current
    if (actions.attack !== null && pose.attackSeq !== seqRef.current.attack) {
      if (seqRef.current.attack >= 0) actions.attack.reset().setEffectiveWeight(1).setEffectiveTimeScale(ATTACK_CLIP_TIMESCALE).play()
      seqRef.current.attack = pose.attackSeq
    }
    if (pose.skillSeq !== seqRef.current.skill) {
      const clip = actions.skill ?? actions.attack
      if (seqRef.current.skill >= 0) clip?.reset().setEffectiveWeight(1).setEffectiveTimeScale(actions.skill !== null ? SKILL_CLIP_TIMESCALE : ATTACK_CLIP_TIMESCALE).play()
      seqRef.current.skill = pose.skillSeq
    }
    const oneShot = (actions.attack?.isRunning() ?? false) || (actions.skill?.isRunning() ?? false)
    const locomotion = oneShot ? 0.15 : 1
    const weights = blendWeights(weightsRef.current, pose.speed, dt)
    weightsRef.current = weights
    actions.idle?.setEffectiveWeight(weights.idle * locomotion)
    if (actions.walk !== null) { actions.walk.setEffectiveWeight(weights.walk * locomotion); actions.walk.setEffectiveTimeScale(clipTimeScale(pose.speed, WALK_CLIP_SPEED)) }
    if (actions.run !== null) { actions.run.setEffectiveWeight(weights.run * locomotion); actions.run.setEffectiveTimeScale(clipTimeScale(pose.speed, RUN_CLIP_SPEED)) }
    mixer.update(dt)
  })

  return (
    <group ref={groupRef} name={`remote-player-${remote.id}`}>
      <primitive object={model.object} />
    </group>
  )
}

/** 로컬 상태를 방에 발행한다(10Hz). 씬의 `player` 그룹(회전 보정 포함)을 읽는다. */
function useLocalPosePublisher() {
  const scene = useThree((s) => s.scene)
  const lastSentRef = useRef(0)
  useFrame(() => {
    const now = performance.now()
    if (now - lastSentRef.current < STATE_INTERVAL_MS) return
    lastSentRef.current = now
    const room = getRoom()
    if (room === null) return
    // 'player' 이름은 큐브 폴백(mesh)도 쓴다 — 아바타 그룹(비메시)만 찾는다. 위치는 프레임(눈높이)에서 발 위치로 환산.
    let group: Object3D | undefined
    scene.traverse((o) => { if (group === undefined && o.name === 'player' && !(o as { isMesh?: boolean }).isMesh) group = o })
    const frame = readPlayerFrame()
    if (group === undefined || frame === null) return
    const pose: PlayerPose = {
      x: frame.position.x, y: frame.position.y - RAYCAST_DEFAULTS.eyeOffset, z: frame.position.z,
      rotY: group.rotation.y,
      speed: frame.speed, grounded: frame.grounded,
      attackSeq: readPlayerAttackSeq(), skillSeq: readPlayerSkillSeq(),
    }
    room.sendPose(pose)
  })
}

export function RemotePlayers() {
  const scene = useGame((s) => s.scene)
  const name = useGame((s) => s.name)
  const jobId = useGame((s) => s.jobId)
  const weapon = useGame((s) => s.equipment.weapon)
  const inGame = scene !== 'title' && scene !== 'create'
  const snap = useRoomSnapshot()
  const [, bump] = useState(0)

  useEffect(() => {
    if (!inGame) return
    ensureRoom({ name, jobId: jobId ?? 'warrior', weapon })
  }, [inGame, name, jobId, weapon])

  // 원격 목록은 스냅샷(peerCount)이 바뀔 때 갱신된다. 보간 샘플은 ref 로 흐르므로 리렌더가 필요 없다.
  useEffect(() => { bump((n) => n + 1) }, [snap.peerCount, snap.status])
  useLocalPosePublisher()

  const remotes = getRoom() === null ? [] : [...getRoom()!.getRemotes().values()]
  return (
    <group name="remote-players">
      {remotes.map((remote) => (
        <Suspense key={remote.id} fallback={null}>
          <RemoteAvatar remote={remote} />
        </Suspense>
      ))}
    </group>
  )
}
