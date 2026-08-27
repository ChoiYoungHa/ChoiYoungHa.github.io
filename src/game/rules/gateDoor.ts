export const GATE_DOOR_OPEN_DISTANCE_METERS = 7
export const GATE_DOOR_CLOSE_DISTANCE_METERS = 12
export const GATE_DOOR_TRANSITION_SECONDS = 1
export const GATE_DOOR_OPEN_DEGREES = 100

export interface GateDoorState {
  open: boolean
  progress: number
  angleDeg: number
}

export const INITIAL_GATE_DOOR: Readonly<GateDoorState> = Object.freeze({
  open: false,
  progress: 0,
  angleDeg: 0,
})

export function stepGateDoor(state: GateDoorState, distanceMeters: number, dtSeconds: number): GateDoorState {
  const open = distanceMeters <= GATE_DOOR_OPEN_DISTANCE_METERS
    ? true
    : distanceMeters >= GATE_DOOR_CLOSE_DISTANCE_METERS
      ? false
      : state.open
  const direction = open ? 1 : -1
  const progress = Math.max(0, Math.min(1,
    state.progress + direction * Math.max(0, dtSeconds) / GATE_DOOR_TRANSITION_SECONDS,
  ))
  const eased = 1 - (1 - progress) ** 3
  return { open, progress, angleDeg: GATE_DOOR_OPEN_DEGREES * eased }
}

/** Keeps the default path closed and avoids even invoking the game-only rule when the gate is off. */
export function advanceGateDoor(
  enabled: boolean,
  state: GateDoorState,
  distanceMeters: number,
  dtSeconds: number,
  step: typeof stepGateDoor = stepGateDoor,
): GateDoorState {
  return enabled ? step(state, distanceMeters, dtSeconds) : INITIAL_GATE_DOOR
}
