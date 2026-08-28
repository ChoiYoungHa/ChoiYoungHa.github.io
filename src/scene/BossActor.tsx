import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { AnimationMixer, LoopOnce, type AnimationAction, type Group, type Mesh } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { GameSession } from '../game/session'
import { readPlayerFrame } from '../store/playerBridge'
import { sampleHeight } from './terrain/heightmap'

/**
 * 2026-08-28 (영하님) — 제1막 보스 「열한 번째」 액터. 코덱스 `bosses/boss-the-eleventh.glb`(정면 +Z, 본 11, 클립 Pig_Attack 1.37s).
 * 세션 스냅샷의 boss(위치·상태·attackSeq)를 useFrame 에서 직접 읽는다(React 리렌더 없음).
 *   · 추격/공격: 플레이어 응시. 배회: 이동 방향 응시.
 *   · attackSeq 증가 → Pig_Attack 1회 재생(충격 0.567s 는 세션 판정과 별개, 연출만).
 *   · dying: 0.6s 동안 앞으로 기울며 가라앉음. dead/null: 숨김.
 */
export const BOSS_MODEL_URL = '/models/bosses/boss-the-eleventh.glb'
export const BOSS_TURN_RATE = 4

export function BossActor({ session }: { session: GameSession }) {
  const groupRef = useRef<Group>(null)
  const { scene, animations } = useGLTF(BOSS_MODEL_URL)
  const model = useMemo(() => {
    const object = cloneSkeleton(scene)
    object.traverse((child) => { const mesh = child as Mesh; if (mesh.isMesh === true) { mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false } })
    return object
  }, [scene])
  const mixer = useMemo(() => new AnimationMixer(model), [model])
  const attackRef = useRef<AnimationAction | null>(null)
  const seqRef = useRef(0)
  const yawRef = useRef(0)
  const lastPos = useRef<{ x: number, z: number } | null>(null)
  const dyingStartRef = useRef<number | null>(null)

  useEffect(() => {
    const clip = animations.find((c) => c.name === 'Pig_Attack') ?? animations[0]
    if (clip !== undefined) {
      const action = mixer.clipAction(clip)
      action.setLoop(LoopOnce, 1)
      action.clampWhenFinished = false
      attackRef.current = action
    }
    return () => { attackRef.current = null; mixer.stopAllAction(); mixer.uncacheRoot(model) }
  }, [animations, mixer, model])

  useFrame((_, rawDt) => {
    const group = groupRef.current
    if (group === null) return
    const dt = Math.min(rawDt, 1 / 20)
    const boss = session.getSnapshot().boss
    if (boss === null || boss.state === 'dead') { group.visible = false; lastPos.current = null; dyingStartRef.current = null; return }
    group.visible = true
    const { x, z } = boss.position
    const player = readPlayerFrame()
    let targetYaw = yawRef.current
    if ((boss.state === 'chase' || boss.state === 'attack') && player !== null) {
      targetYaw = Math.atan2(player.position.x - x, player.position.z - z)
    } else if (lastPos.current !== null) {
      const dx = x - lastPos.current.x
      const dz = z - lastPos.current.z
      if (Math.hypot(dx, dz) > 1e-3) targetYaw = Math.atan2(dx, dz)
    }
    lastPos.current = { x, z }
    let d = targetYaw - yawRef.current
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    yawRef.current += Math.max(-BOSS_TURN_RATE * dt, Math.min(BOSS_TURN_RATE * dt, d))
    // 공격 연출
    if (boss.attackSeq !== seqRef.current) {
      seqRef.current = boss.attackSeq
      attackRef.current?.reset().play()
    }
    // 사망 연출: 앞으로 기울며 가라앉는다
    let pitch = 0
    let sink = 0
    if (boss.state === 'dying') {
      if (dyingStartRef.current === null) dyingStartRef.current = performance.now()
      const t = Math.min(1, (performance.now() - dyingStartRef.current) / 600)
      pitch = t * 0.9
      sink = t * 1.2
    }
    group.position.set(x, sampleHeight(x, z) - sink, z)
    group.rotation.set(pitch, yawRef.current, 0, 'YXZ')
    mixer.update(dt)
  })

  return (
    <group ref={groupRef} name="boss-the-eleventh" visible={false}>
      <primitive object={model} />
    </group>
  )
}

useGLTF.preload(BOSS_MODEL_URL)
