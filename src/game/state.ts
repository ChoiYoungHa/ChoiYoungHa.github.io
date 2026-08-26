import jobs from './data/jobs.json' with { type: 'json' }
import { createInventory, type EquipmentSlot, type Inventory } from './rules/inventory.ts'
import { createQuestProgress, type QuestProgress } from './rules/quest.ts'
import type { IpMode } from './i18n.ts'

export const GAME_SCENES = [
  'title',
  'create',
  'forest',
  'henesys',
  'stan',
  'shop',
  'park',
  'hunt',
  'complete',
  'epilogue',
  'free',
] as const

export type GameScene = typeof GAME_SCENES[number]
export type JobId = keyof typeof jobs

export interface FaceParts {
  faceId: string
  hairId: string
  skinId: string
}

export interface GameState {
  jobId: JobId | null
  name: string
  level: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  exp: number
  meso: number
  inventory: Inventory
  equipment: Record<EquipmentSlot, string | null>
  quest: QuestProgress
  scene: GameScene
  ipMode: IpMode
  faceParts: FaceParts
}

const DEFAULT_FACE_PARTS: FaceParts = {
  faceId: 'face.default',
  hairId: 'hair.default',
  skinId: 'skin.default',
}

export function createInitialState(jobId: JobId | null, name: string): GameState {
  const job = jobId === null ? null : jobs[jobId]
  const inventory = createInventory()

  return {
    jobId,
    name,
    level: 1,
    hp: job?.startHp ?? 0,
    maxHp: job?.startHp ?? 0,
    mp: job?.startMp ?? 0,
    maxMp: job?.startMp ?? 0,
    exp: 0,
    meso: 1500,
    inventory,
    equipment: { ...inventory.equipment },
    quest: createQuestProgress('pig-cleanup'),
    scene: 'title',
    ipMode: 'conti',
    faceParts: { ...DEFAULT_FACE_PARTS },
  }
}

export function jobStartStats(jobId: JobId): { hp: number, mp: number } {
  const job = jobs[jobId]
  return { hp: job.startHp, mp: job.startMp }
}
