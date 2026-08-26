let playerJumpRequested = false
let cameraIntroElapsedMs: number | null = null

export function requestPlayerJump(): void {
  playerJumpRequested = true
}

export function consumePlayerJump(): boolean {
  const requested = playerJumpRequested
  playerJumpRequested = false
  return requested
}

export function setCameraIntroElapsedMs(value: number | null): void {
  cameraIntroElapsedMs = value === null || !Number.isFinite(value) ? null : Math.max(0, value)
}

export function readCameraIntroElapsedMs(): number | null {
  return cameraIntroElapsedMs
}

export function resetGameRuntimeSignals(): void {
  playerJumpRequested = false
  cameraIntroElapsedMs = null
}
