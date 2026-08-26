import mainPath from '../data/main-path.json' with { type: 'json' }

export const CAMERA_INTRO_DURATION_MS = 3_000

export interface CameraIntroTarget {
  x: number
  y: number
  z: number
}

export interface CameraIntroPose {
  pitchDeg: number
  target: CameraIntroTarget
  handedOff: boolean
}

const KEYFRAMES = [
  { atMs: 0, pitchDeg: -28, targetY: 80 },
  { atMs: 1_500, pitchDeg: -16, targetY: 50 },
  { atMs: CAMERA_INTRO_DURATION_MS, pitchDeg: -4, targetY: 0 },
] as const

function mix(start: number, end: number, t: number): number {
  return start + (end - start) * t
}

/** Pure S02 camera pose: sky → canopy → normal player follow target. */
export function cameraIntroAt(
  elapsedMs: number,
  playerTarget: CameraIntroTarget = {
    x: mainPath.landmarks.spawn.x,
    y: 0.6,
    z: mainPath.landmarks.spawn.z,
  },
): CameraIntroPose {
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.min(CAMERA_INTRO_DURATION_MS, elapsedMs))
    : CAMERA_INTRO_DURATION_MS
  if (elapsed >= CAMERA_INTRO_DURATION_MS) {
    const end = KEYFRAMES[2]
    return { pitchDeg: end.pitchDeg, target: { ...playerTarget }, handedOff: true }
  }
  const [from, to] = elapsed <= KEYFRAMES[1].atMs
    ? [KEYFRAMES[0], KEYFRAMES[1]]
    : [KEYFRAMES[1], KEYFRAMES[2]]
  const linear = (elapsed - from.atMs) / (to.atMs - from.atMs)
  const eased = linear * linear * (3 - 2 * linear)
  const treeTarget = {
    x: mainPath.landmarks.heroTree.x,
    y: mix(from.targetY, to.targetY, eased),
    z: mainPath.landmarks.heroTree.z,
  }
  const target = from === KEYFRAMES[1]
    ? {
        x: mix(treeTarget.x, playerTarget.x, eased),
        y: mix(from.targetY, playerTarget.y, eased),
        z: mix(treeTarget.z, playerTarget.z, eased),
      }
    : treeTarget
  return {
    pitchDeg: mix(from.pitchDeg, to.pitchDeg, eased),
    target,
    handedOff: false,
  }
}
