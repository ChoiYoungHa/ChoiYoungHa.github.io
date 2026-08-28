import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AnimationMixer,
  type AnimationClip,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  Object3D as Transform,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Object3D,
} from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import placement from '../data/placement.json' with { type: 'json' }
import { gameBootstrap, type GameBootstrap } from '../game/bootstrap.ts'
import { createGameFrameBridge } from '../game/bridge.ts'
import { epilogueExposureAt } from '../game/epilogueGrade.ts'
import { setGameRuntimeReady } from '../game/runtimeReadiness.ts'
import monsterData from '../game/data/monsters.json' with { type: 'json' }
import { ATTACK_COOLDOWN_SECONDS } from '../game/mobs/ai.ts'
import terraceData from '../game/data/park-terraces.json' with { type: 'json' }
import spawnData from '../game/data/spawns.json' with { type: 'json' }
import { parabolicPosition } from '../game/rules/pickup.ts'
import {
  commitMobWobbleSpeeds,
  createMobWobbleMaterial,
  setMobWobbleSpeed,
} from '../shaders/mobWobble.ts'
import { createSkillFxMaterial } from '../shaders/skillFx.ts'
import { hashSeed, scatter } from './scatter/seededRandom.ts'
import { createKeyboardInput } from '../player/input.ts'
import { readPlayerFrame } from '../store/playerBridge.ts'
import { WARPS } from '../game/session.ts'
import { createGameProjector, installGameProjector } from '../systems/ui/projector.ts'
import { sampleHeight } from './terrain/heightmap.ts'
import { LevelUpRing } from './fx/LevelUpRing.tsx'
import { SkillFx } from './fx/SkillFx.tsx'
import { BossActor } from './BossActor.tsx'
import { bakeGlb } from './util/bakeGlb.ts'

const NPC_SCALE = 0.01
const PIG_SCALE = 0.005
/**
 * R114-A (D5): mob_pig.glb 는 텍스처 0·baseColor 없음에 COLOR_0 평균이 sRGB(132,121,131) 회보라라
 * 노출 0.44 아래서 근접 시 검게 보였다(그림자·법선·wobble 무관 — Docs/qa/m6-r114/d5). 정점색 디테일(눈·발굽)은
 * 유지하고 재질 color 로 분홍 틴트 × 게인을 곱해 휘도를 올린다(A/B: gain 2 는 어둡고 3 이 판독 가능).
 */
const PIG_TINT = '#f2a7bd'
const PIG_TINT_GAIN = 3.0
const MAX_PIGS = 10
/** 2026-08-28 영하님 "돼지가 뒤돌아서 공격" — 추격·공격 중엔 플레이어를 바라보고, 공격 직후 LUNGE 초 동안 앞으로 돌진·숙임(절차 모션, 리그 불필요). */
const PIG_LUNGE_SECONDS = 0.35
const PIG_LUNGE_METERS = 0.45
const PIG_LUNGE_PITCH = 0.3
const MAX_DROPS = 24
/** 2026-08-28 — 드롭은 코덱스 시트 A 3D(`3d-codex/inventory-loot`): 메소 더미(decimate 4K tris)·돼지 리본. 바닥 원점, 제자리 회전. */
const DROP_MODEL_URLS = { meso: '/models/loot/itm-meso.glb', item: '/models/loot/itm-pigribbon.glb' } as const
const DROP_SCALE = { meso: 3.5, item: 2.0 } as const
const DROP_SPIN_RAD_PER_SEC = 1.5

interface RuntimeAsset {
  geometry: BufferGeometry
  material: Material | Material[]
}

interface TerracePoint {
  x: number
  y: number
  z: number
  rotationY: number
  scale: number
}

function setToneMappingExposure(renderer: { toneMappingExposure: number }, exposure: number): void {
  renderer.toneMappingExposure = exposure
}

function bakeAsset(scene: Object3D, rootName?: string): RuntimeAsset {
  scene.updateMatrixWorld(true)
  const root = rootName === undefined ? scene : scene.getObjectByName(rootName) ?? scene
  let found: Mesh | null = null
  root.traverse((object) => {
    const mesh = object as Mesh
    if (found === null && mesh.isMesh) found = mesh
  })
  if (found === null) throw new Error(`runtime mesh missing: ${rootName ?? scene.name}`)
  const mesh = found as Mesh
  const geometry = mesh.geometry.clone()
  geometry.applyMatrix4(mesh.matrixWorld)
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (bounds !== null) {
    geometry.translate(
      -(bounds.min.x + bounds.max.x) * 0.5,
      -bounds.min.y,
      -(bounds.min.z + bounds.max.z) * 0.5,
    )
  }
  geometry.computeBoundingSphere()
  return { geometry, material: mesh.material }
}

function prepareNpc(scene: Object3D): Object3D {
  const copy = cloneSkeleton(scene)
  copy.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false // 스킨 메시 bounding 은 바인드 포즈 기준 — 애니메이션 중 컬링 오판 방지
  })
  return copy
}

/**
 * 2026-08-28 영하님 "NPC 팔 벌리고 있음" — npc_stan/npc_maya.glb 에 든 `idle` 클립을 재생한다.
 * StrictMode 대비: 액션은 effect 안에서 만들고 cleanup 에서 uncacheRoot(Player.tsx 교훈).
 */
function useNpcIdle(object: Object3D, animations: AnimationClip[], phaseOffsetSeconds: number): AnimationMixer {
  const mixer = useMemo(() => new AnimationMixer(object), [object])
  useEffect(() => {
    const clip = animations.find((c) => c.name.toLowerCase() === 'idle') ?? animations[0]
    if (clip === undefined) return
    const action = mixer.clipAction(clip)
    action.reset().play()
    action.time = phaseOffsetSeconds % Math.max(clip.duration, 0.001) // 두 NPC 가 똑같이 흔들리지 않게 위상차
    return () => { mixer.stopAllAction(); mixer.uncacheRoot(object) }
  }, [animations, mixer, object, phaseOffsetSeconds])
  return mixer
}

function makeTerracePoints(): TerracePoint[] {
  const statues = placement.props.filter(({ kind }) => kind === 'statue')
  const blocked = (x: number, z: number) =>
    spawnData.points.some((spawn) => Math.hypot(x - spawn.x, z - spawn.z) < terraceData.spawnClearanceMeters)
    || statues.some((statue) => Math.hypot(x - statue.position[0], z - statue.position[1]) < terraceData.statueClearanceMeters)
  const result: TerracePoint[] = []
  for (const level of terraceData.levels) {
    const count = Math.max(6, Math.round(Math.PI * level.radiusMeters ** 2 * level.rockDensityPerSquareMeter))
    const points = scatter(hashSeed(`${terraceData.runtime.seed}-${level.id}`), {
      count,
      halfExtent: level.radiusMeters,
      scaleMin: 0.55,
      scaleMax: 0.9,
      reject: (x, z) => Math.hypot(x, z) > level.radiusMeters
        || blocked(terraceData.center.x + x, terraceData.center.z + z),
    })
    for (const point of points) {
      const x = terraceData.center.x + point.x
      const z = terraceData.center.z + point.z
      result.push({
        x,
        y: sampleHeight(x, z) + level.heightMeters,
        z,
        rotationY: point.rotationY,
        scale: point.scale,
      })
    }
  }
  return result
}

/** 워프 포탈 링(큰나무 앞 → 공원, 공원 → 마을). 세션 WARPS 좌표와 동일. */
function WarpPortals() {
  const rings = useMemo(() => Object.entries(WARPS).map(([id, warp]) => ({ id, x: warp.center.x, z: warp.center.z, y: sampleHeight(warp.center.x, warp.center.z) + 0.15, r: warp.radius })), [])
  return (
    <group name="m6-warp-portals">
      {rings.map((ring) => (
        <mesh key={ring.id} name={`warp-${ring.id}`} position={[ring.x, ring.y, ring.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.6, ring.r - 0.6), ring.r, 48]} />
          <meshBasicMaterial color="#7fd7ff" transparent opacity={0.75} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

export function GameRuntime({ bootstrap }: { bootstrap: GameBootstrap }) {
  const { camera, gl, size } = useThree()
  const stan = useGLTF('/models/npc_stan.glb')
  const maya = useGLTF('/models/npc_maya.glb')
  const pig = useGLTF('/models/mob_pig.glb')
  const rocks = useGLTF('/models/props_rocks.glb')
  const stonewall = useGLTF('/models/prop_stonewall.glb')
  const mesoGlb = useGLTF(DROP_MODEL_URLS.meso)
  const ribbonGlb = useGLTF(DROP_MODEL_URLS.item)
  const fxTexture = useTexture('/textures/fx_atlas.png')
  const pigRef = useRef<InstancedMesh>(null)
  const mesoDropRef = useRef<InstancedMesh>(null)
  const itemDropRef = useRef<InstancedMesh>(null)
  const terraceRef = useRef<InstancedMesh>(null)
  const runtimeRef = useRef<{
    bridge: ReturnType<typeof createGameFrameBridge>
    keyboard: ReturnType<typeof createKeyboardInput>
  } | null>(null)
  const epilogueGradeRef = useRef<{ baseExposure: number; startedAtMs: number } | null>(null)
  const transform = useMemo(() => new Transform(), [])
  const viewDirection = useMemo(() => new Vector3(), [])
  const stanObject = useMemo(() => prepareNpc(stan.scene), [stan.scene])
  const mayaObject = useMemo(() => prepareNpc(maya.scene), [maya.scene])
  const stanMixer = useNpcIdle(stanObject, stan.animations, 0)
  const mayaMixer = useNpcIdle(mayaObject, maya.animations, 1.3)
  const statueObjects = useMemo(
    () => placement.props.filter(({ kind }) => kind === 'statue').map(() => stonewall.scene.clone(true)),
    [stonewall.scene],
  )
  const pigAsset = useMemo(() => bakeAsset(pig.scene), [pig.scene])
  const pigMaterial = useMemo(() => {
    const material = createMobWobbleMaterial(pigAsset.material)
    for (const entry of Array.isArray(material) ? material : [material]) entry.color.set(PIG_TINT).multiplyScalar(PIG_TINT_GAIN)
    return material
  }, [pigAsset.material])
  const pigSpeed = useMemo(() => {
    const attribute = new InstancedBufferAttribute(new Float32Array(MAX_PIGS), 1).setUsage(DynamicDrawUsage)
    pigAsset.geometry.setAttribute('speed', attribute)
    return attribute
  }, [pigAsset.geometry])
  const rockAsset = useMemo(() => bakeAsset(rocks.scene, 'rock_smallA'), [rocks.scene])
  const terracePoints = useMemo(() => makeTerracePoints(), [])
  const projector = useMemo(
    () => createGameProjector(camera, { width: size.width, height: size.height }),
    [camera, size.height, size.width],
  )
  const mesoAsset = useMemo(() => bakeGlb(mesoGlb.scene), [mesoGlb.scene])
  const ribbonAsset = useMemo(() => bakeGlb(ribbonGlb.scene), [ribbonGlb.scene])
  const fxAtlas = useMemo(() => {
    const texture = fxTexture.clone()
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }, [fxTexture])
  const fxMaterial = useMemo(() => createSkillFxMaterial(fxAtlas), [fxAtlas])

  useEffect(() => installGameProjector(projector), [projector])
  useEffect(() => {
    const keyboard = createKeyboardInput(window, { gameInputEnabled: true })
    const bridge = createGameFrameBridge(bootstrap.session, keyboard)
    runtimeRef.current = { bridge, keyboard }
    setGameRuntimeReady(true)
    return () => {
      setGameRuntimeReady(false)
      if (runtimeRef.current?.bridge === bridge) runtimeRef.current = null
      bridge.dispose()
      keyboard.dispose()
    }
  }, [bootstrap.session])
  useEffect(() => () => {
    if (epilogueGradeRef.current !== null) {
      setToneMappingExposure(gl, epilogueGradeRef.current.baseExposure)
      epilogueGradeRef.current = null
    }
    pigAsset.geometry.dispose()
    rockAsset.geometry.dispose()
    mesoAsset.geometry.dispose()
    ribbonAsset.geometry.dispose()
    fxMaterial.dispose()
    fxAtlas.dispose()
    if (Array.isArray(pigMaterial)) pigMaterial.forEach((material) => material.dispose())
    else pigMaterial.dispose()
  }, [mesoAsset.geometry, ribbonAsset.geometry, fxAtlas, fxMaterial, gl, pigAsset.geometry, pigMaterial, rockAsset.geometry])
  useEffect(() => {
    const mesh = terraceRef.current
    if (mesh === null) return
    terracePoints.forEach((point, index) => {
      transform.position.set(point.x, point.y, point.z)
      transform.rotation.set(0, point.rotationY, 0)
      transform.scale.setScalar(point.scale)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.count = terracePoints.length
    mesh.instanceMatrix.needsUpdate = true
  }, [terracePoints, transform])

  useFrame((_, rawDt) => {
    const frame = readPlayerFrame()
    const runtime = runtimeRef.current
    const npcDt = Math.min(rawDt, 1 / 20)
    stanMixer.update(npcDt)
    mayaMixer.update(npcDt)
    if (frame === null || runtime === null) return
    camera.getWorldDirection(viewDirection)
    const result = runtime.bridge.tick({
      dtMs: rawDt * 1000,
      playerPos: frame.position,
      playerYaw: Math.atan2(-viewDirection.x, -viewDirection.z),
      move: frame.speed > 0.05,
      run: frame.speed > 3.3,
    })
    const grade = epilogueGradeRef.current
    if (result.snapshot.game.scene === 'epilogue') {
      const active = grade ?? {
        baseExposure: gl.toneMappingExposure,
        startedAtMs: result.snapshot.epilogueStartedAtMs ?? result.snapshot.nowMs,
      }
      if (grade === null) epilogueGradeRef.current = active
      setToneMappingExposure(gl, epilogueExposureAt(result.snapshot.nowMs - active.startedAtMs, active.baseExposure))
    } else if (grade !== null) {
      setToneMappingExposure(gl, grade.baseExposure)
      epilogueGradeRef.current = null
    }

    const pigs = pigRef.current
    if (pigs !== null) {
      let count = 0
      for (const slot of result.snapshot.spawner.slots) {
        const mob = slot.mob
        if (mob === null || mob.state === 'dead' || count >= MAX_PIGS) continue
        const engaged = mob.state === 'chase' || mob.state === 'attack'
        const faceX = engaged ? frame.position.x : mob.wanderTarget.x
        const faceZ = engaged ? frame.position.z : mob.wanderTarget.z
        const yaw = Math.atan2(faceX - mob.position.x, faceZ - mob.position.z)
        // 공격 직후(attackReadyAt - 쿨다운 = 공격 시각) 짧은 돌진: 앞으로 밀고 코를 숙인다.
        const sinceAttack = result.snapshot.nowMs / 1000 - (mob.attackReadyAtSeconds - ATTACK_COOLDOWN_SECONDS)
        const lunge = mob.state === 'attack' && sinceAttack >= 0 && sinceAttack < PIG_LUNGE_SECONDS ? Math.sin((sinceAttack / PIG_LUNGE_SECONDS) * Math.PI) : 0
        transform.position.set(
          mob.position.x + Math.sin(yaw) * PIG_LUNGE_METERS * lunge,
          sampleHeight(mob.position.x, mob.position.z),
          mob.position.z + Math.cos(yaw) * PIG_LUNGE_METERS * lunge,
        )
        transform.rotation.set(PIG_LUNGE_PITCH * lunge, yaw, 0, 'YXZ')
        transform.scale.setScalar(PIG_SCALE)
        transform.updateMatrix()
        pigs.setMatrixAt(count, transform.matrix)
        const walking = result.snapshot.nowMs / 1000 >= mob.frozenUntilSeconds
          && (mob.state === 'wander' || mob.state === 'chase')
        setMobWobbleSpeed(pigSpeed, count, walking ? monsterData.pig.speed * (mob.state === 'wander' ? 0.5 : 1) : 0)
        count += 1
      }
      pigs.count = count
      pigs.instanceMatrix.needsUpdate = true
      commitMobWobbleSpeeds(pigSpeed)
    }

    const mesoDrops = mesoDropRef.current
    const itemDrops = itemDropRef.current
    if (mesoDrops !== null && itemDrops !== null) {
      const nowSeconds = result.snapshot.nowMs / 1000
      let mesoCount = 0
      let itemCount = 0
      for (const drop of result.snapshot.drops.slice(0, MAX_DROPS)) {
        const position = parabolicPosition(drop, nowSeconds)
        const isMeso = drop.payload.kind === 'meso'
        transform.position.set(position.x, sampleHeight(position.x, position.z) + position.y, position.z)
        transform.rotation.set(0, nowSeconds * DROP_SPIN_RAD_PER_SEC, 0)
        transform.scale.setScalar(isMeso ? DROP_SCALE.meso : DROP_SCALE.item)
        transform.updateMatrix()
        if (isMeso) mesoDrops.setMatrixAt(mesoCount++, transform.matrix)
        else itemDrops.setMatrixAt(itemCount++, transform.matrix)
      }
      mesoDrops.count = mesoCount
      itemDrops.count = itemCount
      mesoDrops.instanceMatrix.needsUpdate = true
      itemDrops.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group name="m6-game-runtime">
      {placement.npcs.map((npc) => (
        <group
          key={npc.id}
          name={`npc-${npc.id}`}
          position={[npc.position[0], sampleHeight(npc.position[0], npc.position[1]), npc.position[1]]}
          rotation-y={npc.yaw}
          userData={{ collisionRadiusMeters: npc.collisionRadiusMeters }}
        >
          <primitive object={npc.id === 'stan' ? stanObject : mayaObject} scale={NPC_SCALE} />
          <mesh name={`npc-${npc.id}-collision`} position-y={0.9}>
            <cylinderGeometry args={[npc.collisionRadiusMeters, npc.collisionRadiusMeters, 1.8, 12]} />
            <meshBasicMaterial visible={false} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={pigRef} args={[pigAsset.geometry, pigMaterial, MAX_PIGS]} frustumCulled={false} castShadow receiveShadow />
      <instancedMesh ref={terraceRef} args={[rockAsset.geometry, rockAsset.material, terracePoints.length]} receiveShadow />
      {placement.props.filter(({ kind }) => kind === 'statue').map((statue, index) => (
        <primitive
          key={`statue-${index}`}
          name={`park-statue-${index}`}
          object={statueObjects[index]}
          position={[statue.position[0], sampleHeight(statue.position[0], statue.position[1]), statue.position[1]]}
          rotation-y={statue.yaw}
          scale={statue.scale}
        />
      ))}
      <instancedMesh ref={mesoDropRef} name="drops-meso" args={[mesoAsset.geometry, mesoAsset.materials, MAX_DROPS]} frustumCulled={false} castShadow />
      <instancedMesh ref={itemDropRef} name="drops-item" args={[ribbonAsset.geometry, ribbonAsset.materials, MAX_DROPS]} frustumCulled={false} castShadow />
      <WarpPortals />
      <SkillFx session={bootstrap.session} material={fxMaterial} />
      <BossActor session={bootstrap.session} />
      <LevelUpRing session={bootstrap.session} material={fxMaterial} />
    </group>
  )
}

export default function GameRuntimeRoot() {
  return gameBootstrap === null ? null : <GameRuntime bootstrap={gameBootstrap} />
}
