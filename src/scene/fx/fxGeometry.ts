import { DynamicDrawUsage, InstancedBufferAttribute, PlaneGeometry } from 'three'
import type { FxRenderInstance } from './fxInstances.ts'

export function createFxGeometry(capacity: number): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1)
  geometry.setAttribute('uvRect', new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage))
  geometry.setAttribute('color', new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage))
  geometry.setAttribute('frame', new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage))
  geometry.setAttribute('life', new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage))
  return geometry
}

export function writeFxAttributes(
  geometry: PlaneGeometry,
  instances: readonly FxRenderInstance[],
): void {
  const uvRect = geometry.getAttribute('uvRect') as InstancedBufferAttribute
  const color = geometry.getAttribute('color') as InstancedBufferAttribute
  const frame = geometry.getAttribute('frame') as InstancedBufferAttribute
  const life = geometry.getAttribute('life') as InstancedBufferAttribute
  instances.forEach((instance, index) => {
    uvRect.setXYZW(index, ...instance.uvRect)
    color.setXYZ(index, ...instance.color)
    frame.setX(index, instance.frame)
    life.setX(index, instance.life)
  })
  uvRect.needsUpdate = true
  color.needsUpdate = true
  frame.needsUpdate = true
  life.needsUpdate = true
}
