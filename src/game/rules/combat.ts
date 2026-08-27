import skillData from '../data/skills.json' with { type: 'json' }
import { forwardFromYaw } from '../../player/input.ts'
import { rollDamage } from './stats.ts'
import type { Rng } from './rng.ts'
import type { SkillDefinition, SkillEffect } from './skills.ts'

export interface CombatPosition {
  x: number
  z: number
}

export interface CombatTarget {
  id: string
  position: CombatPosition
}

export interface CombatHit {
  targetId: string
  damage: number
  critical: boolean
  hitIndex: number
}

export interface BasicAttackInput {
  origin: CombatPosition
  yaw: number
  baseAttack: number
  weaponAttack: number
  targets: CombatTarget[]
  rng: Rng
  rangeMeters?: number
}

export interface AttackResult {
  hits: CombatHit[]
}

export type SkillId = 'flame-slash' | 'rainbow-shot' | 'ice-age' | 'leaping-slash'

export interface SkillAttackInput extends BasicAttackInput {
  skillId: SkillId
  targetId?: string
  impactPosition?: CombatPosition
}

export interface SkillAttackResult extends AttackResult {
  effect: SkillEffect
}

const GEOMETRY_EPSILON = 1e-9
export const BASIC_ATTACK_RANGE_METERS = 1.8
export const BASIC_ATTACK_FOV_DEG = 60
export const WARRIOR_SKILL_RANGE_METERS = 3
export const WARRIOR_SKILL_FOV_DEG = 120
export const ARCHER_SKILL_RANGE_METERS = 12
export const ARCHER_SKILL_FOV_DEG = 30
export const PLAYER_INVULNERABILITY_SECONDS = 0.5

const skills = skillData as unknown as Record<SkillId, SkillDefinition>

function distance(left: CombatPosition, right: CombatPosition): number {
  return Math.hypot(left.x - right.x, left.z - right.z)
}

function inCone(
  origin: CombatPosition,
  yaw: number,
  target: CombatPosition,
  rangeMeters: number,
  fovDeg: number,
): boolean {
  const dx = target.x - origin.x
  const dz = target.z - origin.z
  const targetDistance = Math.hypot(dx, dz)
  if (targetDistance > rangeMeters + GEOMETRY_EPSILON) return false
  if (targetDistance <= GEOMETRY_EPSILON) return true

  // Three.js 캐릭터 규약: yaw 0의 전방은 -Z다.
  const forward = forwardFromYaw(yaw)
  const cosine = (dx * forward.x + dz * forward.z) / targetDistance
  const minimumCosine = Math.cos((fovDeg * Math.PI / 180) / 2)
  return cosine + GEOMETRY_EPSILON >= minimumCosine
}

function nearestInCone(
  input: Pick<BasicAttackInput, 'origin' | 'yaw' | 'targets'>,
  rangeMeters: number,
  fovDeg: number,
  limit: number,
): CombatTarget[] {
  return input.targets
    .filter((target) => inCone(input.origin, input.yaw, target.position, rangeMeters, fovDeg))
    .sort((left, right) => {
      const distanceDifference = distance(input.origin, left.position) - distance(input.origin, right.position)
      return Math.abs(distanceDifference) > GEOMETRY_EPSILON
        ? distanceDifference
        : left.id.localeCompare(right.id)
    })
    .slice(0, limit)
}

export function resolveBasicAttack(input: BasicAttackInput): AttackResult {
  const [target] = nearestInCone(
    input,
    input.rangeMeters ?? BASIC_ATTACK_RANGE_METERS,
    BASIC_ATTACK_FOV_DEG,
    1,
  )
  if (target === undefined) return { hits: [] }

  const result = rollDamage({
    baseAttack: input.baseAttack,
    weaponAttack: input.weaponAttack,
    multiplier: 1,
  }, input.rng)
  return {
    hits: [{
      targetId: target.id,
      damage: result.damage,
      critical: result.critical,
      hitIndex: 0,
    }],
  }
}

function targetsInRadius(
  center: CombatPosition,
  targets: CombatTarget[],
  radiusMeters: number,
  limit: number,
): CombatTarget[] {
  return targets
    .filter((target) => distance(center, target.position) <= radiusMeters + GEOMETRY_EPSILON)
    .sort((left, right) => {
      const delta = distance(center, left.position) - distance(center, right.position)
      return Math.abs(delta) > GEOMETRY_EPSILON ? delta : left.id.localeCompare(right.id)
    })
    .slice(0, limit)
}

function damageHit(
  target: CombatTarget,
  input: SkillAttackInput,
  skill: SkillDefinition,
  hitIndex: number,
): CombatHit {
  const result = rollDamage({
    baseAttack: input.baseAttack,
    weaponAttack: input.weaponAttack,
    multiplier: skill.multiplier,
  }, input.rng)
  return {
    targetId: target.id,
    damage: result.damage,
    critical: result.critical,
    hitIndex,
  }
}

export function resolveSkillAttack(input: SkillAttackInput): SkillAttackResult {
  const skill = skills[input.skillId]
  let selected: CombatTarget[]

  if (input.skillId === 'flame-slash') {
    selected = nearestInCone(
      input,
      WARRIOR_SKILL_RANGE_METERS,
      WARRIOR_SKILL_FOV_DEG,
      skill.targetCount,
    )
  } else if (input.skillId === 'rainbow-shot') {
    selected = nearestInCone(
      input,
      ARCHER_SKILL_RANGE_METERS,
      ARCHER_SKILL_FOV_DEG,
      skill.targetCount,
    )
  } else if (input.skillId === 'ice-age') {
    const target = input.targetId === undefined
      ? input.targets[0]
      : input.targets.find((candidate) => candidate.id === input.targetId)
    selected = target === undefined ? [] : [target]
  } else {
    selected = targetsInRadius(
      input.impactPosition ?? input.origin,
      input.targets,
      skill.effect.radiusMeters ?? 2.5,
      skill.targetCount,
    )
  }

  if ((input.skillId === 'ice-age' || input.skillId === 'rainbow-shot') && selected[0] !== undefined) {
    const hitCount = skill.effect.hits ?? 3
    return {
      effect: { ...skill.effect },
      hits: selected.flatMap((target) => Array.from(
        { length: hitCount }, (_, hitIndex) => damageHit(target, input, skill, hitIndex),
      )),
    }
  }

  return {
    effect: { ...skill.effect },
    hits: selected.map((target) => damageHit(target, input, skill, 0)),
  }
}

export interface EquipmentCombatModifiers {
  rangeMeters: number
  cooldownMs: number
}

export function resolveEquipmentCombatModifiers(
  bonuses: Readonly<Record<string, number>>,
  baseRangeMeters: number,
  baseCooldownMs: number,
): EquipmentCombatModifiers {
  const rangeMeters = Math.max(baseRangeMeters, bonuses.range ?? baseRangeMeters)
  const speedMultiplier = 1 + Math.max(0, bonuses.attackSpeedPercent ?? 0) / 100
  return { rangeMeters, cooldownMs: Math.round(baseCooldownMs / speedMultiplier) }
}

export function leapDestination(origin: CombatPosition, target: CombatPosition, distanceMeters: number): CombatPosition {
  const dx = target.x - origin.x
  const dz = target.z - origin.z
  const distanceMetersToTarget = Math.hypot(dx, dz)
  if (distanceMetersToTarget === 0 || distanceMeters <= 0) return { ...origin }
  const scale = Math.min(1, distanceMeters / distanceMetersToTarget)
  return { x: origin.x + dx * scale, z: origin.z + dz * scale }
}

export function applyTimedMobEffect<T extends { frozenUntilSeconds: number }>(
  mob: T,
  effect: Pick<SkillEffect, 'type' | 'durationMs'>,
  nowSeconds: number,
): T {
  if (effect.type !== 'freeze' || effect.durationMs === undefined) return mob
  return { ...mob, frozenUntilSeconds: Math.max(mob.frozenUntilSeconds, nowSeconds + effect.durationMs / 1000) }
}

export interface PlayerCombatState {
  hp: number
  invulnerableUntilSeconds: number
}

export interface MonsterHitInput {
  damage: number
  nowSeconds: number
}

export interface MonsterHitResult {
  state: PlayerCombatState
  damageApplied: number
  died: boolean
}

export function applyMonsterHit(
  state: PlayerCombatState,
  hit: MonsterHitInput,
): MonsterHitResult {
  if (hit.nowSeconds < state.invulnerableUntilSeconds || hit.damage <= 0) {
    return { state, damageApplied: 0, died: state.hp <= 0 }
  }

  const damageApplied = Math.min(state.hp, hit.damage)
  const hp = Math.max(0, state.hp - damageApplied)
  return {
    state: {
      hp,
      invulnerableUntilSeconds: hit.nowSeconds + PLAYER_INVULNERABILITY_SECONDS,
    },
    damageApplied,
    died: hp === 0,
  }
}
