export const VILLAGE_CAMERA_START_METERS = 6
export const VILLAGE_CAMERA_END_METERS = 9
export const VILLAGE_CAMERA_EASE_SECONDS = 2

/** Smoothstep easing used while the player crosses the village gate trigger. */
export function easeDistance(elapsedSeconds: number): number {
  const progress = Math.max(0, Math.min(1, elapsedSeconds / VILLAGE_CAMERA_EASE_SECONDS))
  const eased = progress * progress * (3 - 2 * progress)
  return VILLAGE_CAMERA_START_METERS
    + (VILLAGE_CAMERA_END_METERS - VILLAGE_CAMERA_START_METERS) * eased
}
