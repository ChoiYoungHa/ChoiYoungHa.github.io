import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Object3D as Transform, type InstancedMesh } from 'three'
import type { MeshBasicNodeMaterial } from 'three/webgpu'
import type { GameSession } from '../../game/session.ts'
import { sampleHeight } from '../terrain/heightmap.ts'
import { createFxGeometry, writeFxAttributes } from './fxGeometry.ts'
import {
  createLevelUpRenderState,
  LEVEL_UP_RING_COUNT,
  stepLevelUpRenderState,
} from './fxInstances.ts'

export interface LevelUpRingProps {
  session: GameSession
  material: MeshBasicNodeMaterial
}

export function LevelUpRing({ session, material }: LevelUpRingProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const stateRef = useRef(createLevelUpRenderState())
  const geometry = useMemo(() => createFxGeometry(LEVEL_UP_RING_COUNT), [])
  const transform = useMemo(() => new Transform(), [])

  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(() => {
    const mesh = meshRef.current
    if (mesh === null) return
    const snapshot = session.getSnapshot()
    const result = stepLevelUpRenderState(
      stateRef.current,
      snapshot.recentEvents,
      snapshot.nowMs,
      snapshot.playerPos,
    )
    stateRef.current = result.state
    result.instances.forEach((instance, index) => {
      const y = sampleHeight(instance.position.x, instance.position.z) + instance.position.y
      transform.position.set(instance.position.x, y, instance.position.z)
      transform.rotation.set(-Math.PI / 2, 0, 0)
      const life = Math.min(1, Math.max(0, instance.life))
      transform.scale.set(instance.scale[0] * life, instance.scale[1] * life, 1)
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    writeFxAttributes(geometry, result.instances)
    mesh.count = result.instances.length
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      name="m6-level-up-rings"
      args={[geometry, material, LEVEL_UP_RING_COUNT]}
      frustumCulled={false}
      renderOrder={2}
    />
  )
}
