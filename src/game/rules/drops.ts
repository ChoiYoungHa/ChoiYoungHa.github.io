import type { Rng } from './rng.ts'

export interface DropTable {
  meso: { min: number, max: number }
  items: Array<{ itemId: string, chance: number, quantity: number }>
}

export interface DropResult {
  meso: number
  items: Array<{ itemId: string, quantity: number }>
}

export function rollDrops(table: DropTable, rng: Rng): DropResult {
  const span = table.meso.max - table.meso.min + 1
  const meso = table.meso.min + Math.floor(rng() * span)
  const items = table.items
    .filter((drop) => rng() < drop.chance)
    .map(({ itemId, quantity }) => ({ itemId, quantity }))

  return { meso, items }
}
