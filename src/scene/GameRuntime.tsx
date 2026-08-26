import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  MeshBasicMaterial,
  Object3D as Transform,
  PlaneGeometry,
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
import monsterData from '../game/data/monsters.json' with { type: 'json' }
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
import { createGameProjector, installGameProjector } from '../systems/ui/projector.ts'
import { sampleHeight } from './terrain/heightmap.ts'
import { LevelUpRing } from './fx/LevelUpRing.tsx'
import { SkillFx } from './fx/SkillFx.tsx'

const NPC_SCALE = 0.01
const PIG_SCALE = 0.005
const MAX_PIGS = 10
const MAX_DROPS = 24
const DROP_COLORS = { meso: new Color('#ffd35a'), item: new Color('#ff7eb6') } as const

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
  })
  return copy
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

export function GameRuntime({ bootstrap }: { bootstrap: GameBootstrap }) {
  const { camera, size } = useThree()
  const stan = useGLTF('/models/npc_stan.glb')
  const maya = useGLTF('/models/npc_maya.glb')
  const pig = useGLTF('/models/mob_pig.glb')
  const rocks = useGLTF('/models/props_rocks.glb')
  const stonewall = useGLTF('/models/prop_stonewall.glb')
  const dropTexture = useTexture('/ui/items/itm-meso.png')
  const fxTexture = useTexture('/textures/fx_atlas.png')
  const pigRef = useRef<InstancedMesh>(null)
  const dropRef = useRef<InstancedMesh>(null)
  const terraceRef = useRef<InstancedMesh>(null)
  const runtimeRef = useRef<{
    bridge: ReturnType<typeof createGameFrameBridge>
    keyboard: ReturnType<typeof createKeyboardInput>
  } | null>(null)
  const transform = useMemo(() => new Transform(), [])
  const viewDirection = useMemo(() => new Vector3(), [])
  const stanObject = useMemo(() => prepareNpc(stan.scene), [stan.scene])
  const mayaObject = useMemo(() => prepareNpc(maya.scene), [maya.scene])
  const statueObjects = useMemo(
    () => placement.props.filter(({ kind }) => kind === 'statue').map(() => stonewall.scene.clone(true)),
    [stonewall.scene],
  )
  const pigAsset = useMemo(() => bakeAsset(pig.scene), [pig.scene])
  const pigMaterial = useMemo(() => createMobWobbleMaterial(pigAsset.material), [pigAsset.material])
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
  const dropGeometry = useMemo(() => new PlaneGeometry(0.7, 0.7), [])
  const spriteTexture = useMemo(() => {
    const texture = dropTexture.clone()
    texture.colorSpace = SRGBColorSpace
    texture.needsUpdate = true
    return texture
  }, [dropTexture])
  const dropMaterial = useMemo(() => {
    return new MeshBasicMaterial({ map: spriteTexture, transparent: true, alphaTest: 0.25, toneMapped: false, vertexColors: true })
  }, [spriteTexture])
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
    return () => {
      if (runtimeRef.current?.bridge === bridge) runtimeRef.current = null
      bridge.dispose()
      keyboard.dispose()
    }
  }, [bootstrap.session])
  useEffect(() => () => {
    pigAsset.geometry.dispose()
    rockAsset.geometry.dispose()
    dropGeometry.dispose()
    dropMaterial.dispose()
    spriteTexture.dispose()
    fxMaterial.dispose()
    fxAtlas.dispose()
    if (Array.isArray(pigMaterial)) pigMaterial.forEach((material) => material.dispose())
    else pigMaterial.dispose()
  }, [dropGeometry, dropMaterial, fxAtlas, fxMaterial, pigAsset.geometry, pigMaterial, rockAsset.geometry, spriteTexture])
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
    if (frame === null || runtime === null) return
    camera.getWorldDirection(viewDirection)
    const result = runtime.bridge.tick({
      dtMs: rawDt * 1000,
      playerPos: frame.position,
      playerYaw: Math.atan2(-viewDirection.x, -viewDirection.z),
      move: frame.speed > 0.05,
      run: frame.speed > 3.3,
    })

    const pigs = pigRef.current
    if (pigs !== null) {
      let count = 0
      for (const slot of result.snapshot.spawner.slots) {
        const mob = slot.mob
        if (mob === null || mob.state === 'dead' || count >= MAX_PIGS) continue
        transform.position.set(mob.position.x, sampleHeight(mob.position.x, mob.position.z), mob.position.z)
        transform.rotation.set(0, Math.atan2(mob.wanderTarget.x - mob.position.x, mob.wanderTarget.z - mob.position.z), 0)
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

    const drops = dropRef.current
    if (drops !== null) {
      const visible = result.snapshot.drops.slice(0, MAX_DROPS)
      visible.forEach((drop, index) => {
        const position = parabolicPosition(drop, result.snapshot.nowMs / 1000)
        transform.position.set(position.x, sampleHeight(position.x, position.z) + position.y + 0.45, position.z)
        transform.quaternion.copy(camera.quaternion)
        transform.scale.setScalar(0.8)
        transform.updateMatrix()
        drops.setMatrixAt(index, transform.matrix)
        drops.setColorAt(index, DROP_COLORS[drop.payload.kind])
      })
      drops.count = visible.length
      drops.instanceMatrix.needsUpdate = true
      if (drops.instanceColor !== null) drops.instanceColor.needsUpdate = true
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
      <instancedMesh ref={terraceRef} args={[rockAsset.geometry, rockAsset.material, terracePoints.length]} castShadow receiveShadow />
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
      <instancedMesh ref={dropRef} args={[dropGeometry, dropMaterial, MAX_DROPS]} frustumCulled={false} />
      <SkillFx session={bootstrap.session} material={fxMaterial} />
      <LevelUpRing session={bootstrap.session} material={fxMaterial} />
    </group>
  )
}

export default function GameRuntimeRoot() {
  return gameBootstrap === null ? null : <GameRuntime bootstrap={gameBootstrap} />
}
