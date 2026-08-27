let playerJumpRequested = false
let playerAttackSeq = 0
let playerSkillSeq = 0
let cameraIntroElapsedMs: number | null = null

export function requestPlayerJump(): void {
  playerJumpRequested = true
}

/** 공격/스킬 edge 마다 1 증가. 아바타는 값 변화로 one-shot 클립을 재생한다. */
export function requestPlayerAttack(): void {
  playerAttackSeq += 1
}

export function readPlayerAttackSeq(): number {
  return playerAttackSeq
}

export function requestPlayerSkill(): void {
  playerSkillSeq += 1
}

export function readPlayerSkillSeq(): number {
  return playerSkillSeq
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
  playerAttackSeq = 0
  playerSkillSeq = 0
  playerJumpRequested = false
  cameraIntroElapsedMs = null
}
