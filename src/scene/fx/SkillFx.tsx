import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Object3D as Transform, type InstancedMesh } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import type { GameSession } from '../../game/session.ts'
import { sampleHeight } from '../terrain/heightmap.ts'
import { createFxGeometry, writeFxAttributes } from './fxGeometry.ts'
import {
  createFxRenderState,
  FX_INSTANCE_CAPACITY,
  stepFxRenderState,
  type FxPoint,
} from './fxInstances.ts'

export interface SkillFxProps {
  session: GameSession
  material: MeshBasicNodeMaterial
}

export function SkillFx({ session, material }: SkillFxProps) {
  const camera = useThree((state) => state.camera)
  const meshRef = useRef<InstancedMesh>(null)
  const stateRef = useRef(createFxRenderState())
  const geometry = useMemo(() => createFxGeometry(FX_INSTANCE_CAPACITY), [])
  const centers = useMemo<[number, number, number][]>(
    () => Array.from({ length: FX_INSTANCE_CAPACITY }, () => [0, 0, 0]),
    [],
  )
  const transform = useMemo(() => new Transform(), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) return
    const snapshot = session.getSnapshot()
    const targetPositions: Record<string, FxPoint> = {}
    for (const slot of snapshot.spawner.slots) {
      if (slot.mob !== null) targetPositions[slot.mob.id] = slot.mob.position
    }
    const result = stepFxRenderState(stateRef.current, snapshot.recentEvents, snapshot.nowMs, {
      playerPosition: snapshot.playerPos,
      playerYaw: snapshot.playerYaw,
      targetPositions,
    })
    stateRef.current = result.state
    result.instances.forEach((instance, index) => {
      const y = sampleHeight(instance.position.x, instance.position.z) + instance.position.y
      transform.position.set(instance.position.x, y, instance.position.z)
      centers[index][0] = instance.position.x
      centers[index][1] = y
      centers[index][2] = instance.position.z
      if (instance.billboard === 'full') transform.quaternion.copy(camera.quaternion)
      else transform.rotation.set(0, Math.atan2(
        camera.position.x - instance.position.x,
        camera.position.z - instance.position.z,
      ), 0)
      transform.scale.set(instance.scale[0], instance.scale[1], 1)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    writeFxAttributes(geometry, result.instances, centers)
    mesh.count = result.instances.length
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      name="m6-skill-fx"
      args={[geometry, material, FX_INSTANCE_CAPACITY]}
      frustumCulled={false}
      renderOrder={3}
    />
  )
}
