import type { Camera } from 'three'
import { Vector3 } from 'three'
import type { SessionPosition } from '../../game/session.ts'

export interface ProjectedPoint {
  x: number
  y: number
  visible?: boolean
}

export type GameProjector = (position: SessionPosition) => ProjectedPoint

const HIDDEN: ProjectedPoint = { x: 0, y: 0, visible: false }
let currentProjector: GameProjector = () => HIDDEN

export function createGameProjector(
  camera: Camera,
  size: Readonly<{ width: number, height: number }>,
): GameProjector {
  const projected = new Vector3()
  return ({ x, y = 0, z }: SessionPosition) => {
    projected.set(x, y, z).project(camera)
    const visible = Number.isFinite(projected.x)
      && Number.isFinite(projected.y)
      && Number.isFinite(projected.z)
      && Math.abs(projected.x) <= 1
      && Math.abs(projected.y) <= 1
      && projected.z >= -1
      && projected.z <= 1
    return {
      x: (projected.x * 0.5 + 0.5) * size.width,
      y: (-projected.y * 0.5 + 0.5) * size.height,
      visible,
    }
  }
}

/** DOM overlay가 받는 안정적인 함수. Canvas 쪽 구현만 교체된다. */
export const gameProjector: GameProjector = (position) => currentProjector(position)

export function installGameProjector(projector: GameProjector): () => void {
  currentProjector = projector
  return () => {
    if (currentProjector === projector) currentProjector = () => HIDDEN
  }
}
