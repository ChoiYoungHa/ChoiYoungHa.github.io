export const FLOATER_POOL_CAPACITY = 16
export const DROP_POOL_CAPACITY = 24

export interface PoolHandle {
  index: number
  generation: number
}

export interface PoolSlot<T> {
  active: boolean
  value: T | null
  acquiredAt: number
  generation: number
}

export interface PoolState<T> {
  capacity: number
  slots: PoolSlot<T>[]
}

export interface AcquireResult<T> {
  pool: PoolState<T>
  handle: PoolHandle
  replaced: T | null
}

export interface ReleaseResult<T> {
  pool: PoolState<T>
  released: boolean
}

export function createPool<T>(capacity: number): PoolState<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError('pool capacity must be a positive integer')
  }
  return {
    capacity,
    slots: Array.from({ length: capacity }, (): PoolSlot<T> => ({
      active: false,
      value: null,
      acquiredAt: 0,
      generation: 0,
    })),
  }
}

export function createFloaterPool<T>(): PoolState<T> {
  return createPool<T>(FLOATER_POOL_CAPACITY)
}

export function createDropPool<T>(): PoolState<T> {
  return createPool<T>(DROP_POOL_CAPACITY)
}

function acquisitionIndex<T>(pool: PoolState<T>): number {
  const inactive = pool.slots.findIndex((slot) => !slot.active)
  if (inactive >= 0) return inactive

  let oldest = 0
  for (let index = 1; index < pool.slots.length; index += 1) {
    if (pool.slots[index].acquiredAt < pool.slots[oldest].acquiredAt) oldest = index
  }
  return oldest
}

export function acquire<T>(
  pool: PoolState<T>,
  value: T,
  acquiredAt: number,
): AcquireResult<T> {
  if (!Number.isFinite(acquiredAt)) throw new RangeError('acquiredAt must be finite')
  const index = acquisitionIndex(pool)
  const previous = pool.slots[index]
  const generation = previous.generation + 1
  const slots = pool.slots.slice()
  slots[index] = {
    active: true,
    value,
    acquiredAt,
    generation,
  }
  return {
    pool: { ...pool, slots },
    handle: { index, generation },
    replaced: previous.active ? previous.value : null,
  }
}

export function release<T>(pool: PoolState<T>, handle: PoolHandle): ReleaseResult<T> {
  const slot = pool.slots[handle.index]
  if (slot === undefined || !slot.active || slot.generation !== handle.generation) {
    return { pool, released: false }
  }

  const slots = pool.slots.slice()
  slots[handle.index] = { ...slot, active: false, value: null }
  return { pool: { ...pool, slots }, released: true }
}

export function activeCount<T>(pool: PoolState<T>): number {
  return pool.slots.reduce((count, slot) => count + Number(slot.active), 0)
}

export function activeValues<T>(pool: PoolState<T>): T[] {
  return pool.slots
    .flatMap((slot, index) => slot.active && slot.value !== null
      ? [{ value: slot.value, acquiredAt: slot.acquiredAt, index }]
      : [])
    .sort((left, right) => left.acquiredAt - right.acquiredAt || left.index - right.index)
    .map(({ value }) => value)
}
