import jobs from './data/jobs.json' with { type: 'json' }
import { createInventory, type EquipmentSlot, type Inventory } from './rules/inventory.ts'
import { createQuestProgress, type QuestProgress } from './rules/quest.ts'
import { IP_MODE_DEFAULT, type IpMode } from './i18n.ts'

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
  eyeId: string
  noseId: string
  mouthId: string
  hairId: string
  skinId: string
  hairColorId: string
  eyeColorId: string
  outfitId: string
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
  /** 2026-08-28 — 퀵슬롯 3~6 에 등록한 소비 아이템 id(null = 비어 있음). 1·2 는 공격·스킬 고정. */
  quickSlots: Record<'3' | '4' | '5' | '6', string | null>
  quest: QuestProgress
  scene: GameScene
  ipMode: IpMode
  faceParts: FaceParts
}

const DEFAULT_FACE_PARTS: FaceParts = {
  faceId: 'round',
  eyeId: 'basic',
  noseId: 'dot',
  mouthId: 'smile',
  hairId: 'short',
  skinId: 'skin-warm',
  hairColorId: 'hair-espresso',
  eyeColorId: 'eye-brown',
  outfitId: 'warrior',
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
    quickSlots: { '3': null, '4': null, '5': null, '6': null },
    quest: createQuestProgress('pig-cleanup'),
    scene: 'title',
    ipMode: IP_MODE_DEFAULT,
    faceParts: { ...DEFAULT_FACE_PARTS, outfitId: jobId ?? DEFAULT_FACE_PARTS.outfitId },
  }
}

export function jobStartStats(jobId: JobId): { hp: number, mp: number } {
  const job = jobs[jobId]
  return { hp: job.startHp, mp: job.startMp }
}
