import type { Rng } from './rng.ts'

export interface ExperienceState {
  level: number
  exp: number
}

export interface ExperienceResult extends ExperienceState {
  levelsGained: number
}

export interface DamageInput {
  baseAttack: number
  weaponAttack: number
  multiplier: number
}

export interface DamageResult {
  damage: number
  variance: number
  critical: boolean
}

export const DAMAGE_VARIANCE_MIN = 0.9
export const DAMAGE_VARIANCE_MAX = 1.1
export const CRITICAL_CHANCE = 0.12
export const CRITICAL_MULTIPLIER = 1.5

export function expRequiredForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('level must be a positive integer')
  }
  return 15 * level * level
}

export function applyExperience(state: ExperienceState, gained: number): ExperienceResult {
  if (!Number.isFinite(gained) || gained < 0) {
    throw new RangeError('gained experience must be non-negative')
  }

  let level = state.level
  let exp = state.exp + gained
  let levelsGained = 0

  while (exp >= expRequiredForLevel(level)) {
    exp -= expRequiredForLevel(level)
    level += 1
    levelsGained += 1
  }

  return { level, exp, levelsGained }
}

export function rollDamage(input: DamageInput, rng: Rng): DamageResult {
  const variance = DAMAGE_VARIANCE_MIN + rng() * (DAMAGE_VARIANCE_MAX - DAMAGE_VARIANCE_MIN)
  const critical = rng() < CRITICAL_CHANCE
  const criticalMultiplier = critical ? CRITICAL_MULTIPLIER : 1
  const damage = Math.round(
    (input.baseAttack + input.weaponAttack) * input.multiplier * variance * criticalMultiplier,
  )

  return { damage, variance, critical }
}
