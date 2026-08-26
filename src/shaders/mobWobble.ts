import type { InstancedBufferAttribute, Material } from 'three'
import { attribute, float, instanceIndex, positionGeometry, positionLocal, sin, step, time, vec3 } from 'three/tsl'
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu'

export const MOB_WOBBLE_AMPLITUDE = 0.06
export const MOB_WOBBLE_FREQUENCY = 8
export const MOB_WOBBLE_LEG_MAX_Y = 0.3

/** CPU seam matching the TSL expression; used by deterministic amplitude tests. */
export function mobWobbleOffset(
  positionY: number,
  timeSeconds: number,
  speed: number,
  instanceId: number,
): number {
  if (speed <= 0 || positionY >= MOB_WOBBLE_LEG_MAX_Y) return 0
  return Math.sin(timeSeconds * MOB_WOBBLE_FREQUENCY + instanceId) * MOB_WOBBLE_AMPLITUDE
}

export function setMobWobbleSpeed(attribute: InstancedBufferAttribute, index: number, speed: number): void {
  attribute.setX(index, speed)
}

export function commitMobWobbleSpeeds(attribute: InstancedBufferAttribute): void {
  attribute.needsUpdate = true
}

function wobbleMaterial(source: Material): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial().copy(source)
  const speed = attribute('speed', 'float') as unknown as Node<'float'>
  const lowerLeg = step(float(MOB_WOBBLE_LEG_MAX_Y - 1e-4), positionGeometry.y).oneMinus() as unknown as Node<'float'>
  const moving = step(float(1e-4), speed)
  const phase = time.mul(MOB_WOBBLE_FREQUENCY).add(float(instanceIndex))
  const offsetZ = sin(phase).mul(MOB_WOBBLE_AMPLITUDE).mul(lowerLeg).mul(moving) as unknown as Node<'float'>
  material.positionNode = positionLocal.add(vec3(float(0), float(0), offsetZ))
  material.userData = { ...material.userData, mobWobble: true }
  return material
}

/** Replaces the pig's source material one-for-one, so active material count is unchanged. */
export function createMobWobbleMaterial(
  source: Material | Material[],
): MeshStandardNodeMaterial | MeshStandardNodeMaterial[] {
  return Array.isArray(source) ? source.map(wobbleMaterial) : wobbleMaterial(source)
}
