export interface SkillEffect {
  type: string
  durationMs?: number
  ticks?: number
  damagePerTick?: number
  totalDamage?: number
  hits?: number
  radiusMeters?: number
}

export interface SkillDefinition {
  id: string
  jobId: string
  nameKey: string
  multiplier: number
  mpCost: number
  cooldownMs: number
  targetCount: number
  effect: SkillEffect
}

export interface SkillState {
  mp: number
  readyAt: Record<string, number>
}

export type SkillCastResult =
  | { ok: true, state: SkillState, effect: SkillEffect }
  | { ok: false, reason: 'MP 부족' | '쿨다운 중', state: SkillState }

export function createSkillState(mp: number): SkillState {
  if (!Number.isFinite(mp) || mp < 0) throw new RangeError('mp must be non-negative')
  return { mp, readyAt: {} }
}

export function tryCastSkill(
  state: SkillState,
  skill: SkillDefinition,
  nowMs: number,
): SkillCastResult {
  if (state.mp < skill.mpCost) {
    return { ok: false, reason: 'MP 부족', state }
  }
  if (nowMs < (state.readyAt[skill.id] ?? 0)) {
    return { ok: false, reason: '쿨다운 중', state }
  }

  return {
    ok: true,
    state: {
      mp: state.mp - skill.mpCost,
      readyAt: { ...state.readyAt, [skill.id]: nowMs + skill.cooldownMs },
    },
    effect: { ...skill.effect },
  }
}
