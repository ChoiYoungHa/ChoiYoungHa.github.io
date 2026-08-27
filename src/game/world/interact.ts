import { forwardFromYaw } from '../../player/input.ts'

export interface InteractionPosition {
  x: number
  z: number
}

export interface InteractableNpc {
  id: string
  position: InteractionPosition
}

export interface InteractionOptions {
  range: number
  fovDeg: number
}

const DEFAULT_OPTIONS: InteractionOptions = { range: 2.5, fovDeg: 90 }
const EPSILON = 1e-9

export function findInteractable(
  playerPosition: InteractionPosition,
  playerYaw: number,
  npcs: InteractableNpc[],
  options: InteractionOptions = DEFAULT_OPTIONS,
): string | null {
  const forward = forwardFromYaw(playerYaw)
  const minimumCosine = Math.cos((options.fovDeg * Math.PI / 180) / 2)

  const candidates = npcs.flatMap((npc) => {
    const dx = npc.position.x - playerPosition.x
    const dz = npc.position.z - playerPosition.z
    const distance = Math.hypot(dx, dz)
    if (distance > options.range + EPSILON) return []
    const cosine = distance <= EPSILON
      ? 1
      : (dx * forward.x + dz * forward.z) / distance
    return cosine + EPSILON >= minimumCosine ? [{ npc, distance }] : []
  })

  candidates.sort((left, right) => {
    const delta = left.distance - right.distance
    return Math.abs(delta) > EPSILON ? delta : left.npc.id.localeCompare(right.npc.id)
  })
  return candidates[0]?.npc.id ?? null
}
