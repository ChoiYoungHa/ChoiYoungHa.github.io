import {
  acquire,
  createFloaterPool,
  release,
  type PoolState,
} from '../../game/util/pool.ts'
import monsterData from '../../game/data/monsters.json' with { type: 'json' }

export const DAMAGE_FLOATER_LIFETIME_MS = 800
export const MOB_HP_BAR_LIMIT = 10

export interface DamageFloaterSpawn {
  id: string
  damage: number
  critical: boolean
  screenX: number
  screenY: number
}

interface DamageFloaterValue extends DamageFloaterSpawn {}

export interface DamageFloaterState {
  pool: PoolState<DamageFloaterValue>
}

export interface DamageFloaterPresentation {
  id: string
  text: string
  x: number
  y: number
  opacity: number
  scale: 1 | 1.4
  color: string
}

export interface MobHpBarInput {
  id: string
  hp: number
  maxHp: number
  screenX: number
  screenY: number
}

export interface MobHpBarPresentation extends MobHpBarInput {
  percent: number
}

export function mobHpBarInput(mob: { id: string, hp: number, maxHp?: number }, screenX: number, screenY: number): MobHpBarInput {
  return { id: mob.id, hp: mob.hp, maxHp: mob.maxHp ?? monsterData.pig.hp, screenX, screenY }
}

export function createDamageFloaterState(): DamageFloaterState {
  return { pool: createFloaterPool<DamageFloaterValue>() }
}

export function stepDamageFloaters(
  previous: DamageFloaterState,
  nowMs: number,
  spawns: readonly DamageFloaterSpawn[] = [],
): DamageFloaterState {
  let pool = previous.pool
  for (const [index, slot] of pool.slots.entries()) {
    if (!slot.active || nowMs - slot.acquiredAt < DAMAGE_FLOATER_LIFETIME_MS) continue
    pool = release(pool, { index, generation: slot.generation }).pool
  }
  for (const spawn of spawns) {
    pool = acquire(pool, { ...spawn }, nowMs).pool
  }
  return { pool }
}

export function damageFloaterPresentation(state: DamageFloaterState, nowMs: number): DamageFloaterPresentation[] {
  return state.pool.slots.flatMap((slot) => {
    if (!slot.active || slot.value === null) return []
    const elapsed = Math.max(0, nowMs - slot.acquiredAt)
    if (elapsed >= DAMAGE_FLOATER_LIFETIME_MS) return []
    const progress = elapsed / DAMAGE_FLOATER_LIFETIME_MS
    return [{
      id: slot.value.id,
      text: String(Math.max(0, Math.round(slot.value.damage))),
      x: slot.value.screenX,
      y: slot.value.screenY - progress * 36,
      opacity: 1 - progress,
      scale: slot.value.critical ? 1.4 : 1,
      color: slot.value.critical ? '#e8c37a' : '#f2eee5',
    }]
  })
}

export function mobHpBarPresentation(mobs: readonly MobHpBarInput[]): MobHpBarPresentation[] {
  return mobs.slice(0, MOB_HP_BAR_LIMIT).map((mob) => ({
    ...mob,
    percent: mob.maxHp <= 0 ? 0 : Math.max(0, Math.min(100, (mob.hp / mob.maxHp) * 100)),
  }))
}

export function combatOverlayNodeCounts(
  floaters: DamageFloaterState,
  mobs: readonly MobHpBarInput[],
  nowMs: number,
): { floaters: number, hpBars: number, total: number } {
  const floaterCount = damageFloaterPresentation(floaters, nowMs).length
  const hpBarCount = mobHpBarPresentation(mobs).length
  return { floaters: floaterCount, hpBars: hpBarCount, total: floaterCount + hpBarCount }
}
