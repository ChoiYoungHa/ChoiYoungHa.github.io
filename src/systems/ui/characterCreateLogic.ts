import rawJobs from '../../game/data/jobs.json' with { type: 'json' }
import rawSkills from '../../game/data/skills.json' with { type: 'json' }
import { t, type IpMode } from '../../game/i18n.ts'
import {
  portraitParts,
  randomSelection,
  type PortraitSelection,
} from '../../game/portrait/compose.ts'
import type { JobId } from '../../game/state.ts'

export type CharacterNameFailure = 'empty' | 'whitespace' | 'too-long'
export type PortraitPartKey = keyof PortraitSelection

interface JobDefinition {
  id: JobId
  name: string
  startHp: number
  startMp: number
  baseAttack: number
  skillId: string
}

interface SkillDefinition { name: string }

const JOBS = rawJobs as unknown as Record<JobId, JobDefinition>
const SKILLS = rawSkills as unknown as Record<string, SkillDefinition>
const JOB_ORDER: readonly JobId[] = ['warrior', 'archer', 'mage', 'thief']
const JOB_COLORS: Readonly<Record<JobId, string>> = {
  warrior: '#e05a3a',
  archer: '#4fae63',
  mage: '#4a90d9',
  thief: '#9b6bd6',
}
const PORTRAIT_IDS: Readonly<Record<PortraitPartKey, readonly string[]>> = {
  faceId: portraitParts.faces.map(({ id }) => id),
  eyeId: portraitParts.eyes.map(({ id }) => id),
  noseId: portraitParts.noses.map(({ id }) => id),
  mouthId: portraitParts.mouths.map(({ id }) => id),
  hairId: portraitParts.hairs.map(({ id }) => id),
  skinId: portraitParts.skinColors.map(({ id }) => id),
  hairColorId: portraitParts.hairColors.map(({ id }) => id),
  eyeColorId: portraitParts.eyeColors.map(({ id }) => id),
  outfitId: portraitParts.outfits.map(({ id }) => id),
}

export interface CharacterNameValidation {
  valid: boolean
  reason: CharacterNameFailure | null
}

export interface JobCardPresentation {
  id: JobId
  name: string
  description: string
  color: string
  startStats: { hp: number, mp: number, attack: number }
  skillName: string
  selected: boolean
  intensity: 1 | 0.6
}

export interface CharacterCreatePresentation {
  title: string
  nameLabel: string
  namePlaceholder: string
  nameError: string | null
  randomLabel: string
  confirmLabel: string
  canConfirm: boolean
  jobs: JobCardPresentation[]
}

export interface CharacterCreateSelection {
  name: string
  jobId: JobId
  portrait: PortraitSelection
}

export function validateCharacterName(name: string): CharacterNameValidation {
  if (name.length === 0) return { valid: false, reason: 'empty' }
  if (/\s/u.test(name)) return { valid: false, reason: 'whitespace' }
  if ([...name].length > 8) return { valid: false, reason: 'too-long' }
  return { valid: true, reason: null }
}

export function cycleIndex(index: number, direction: number, length: number): number {
  if (!Number.isInteger(length) || length < 1) throw new RangeError('length must be positive')
  return ((index + direction) % length + length) % length
}

export function cyclePortraitPart(
  selection: PortraitSelection,
  partKey: PortraitPartKey,
  direction: -1 | 1,
): PortraitSelection {
  const ids = PORTRAIT_IDS[partKey]
  const currentIndex = ids.indexOf(selection[partKey])
  const nextIndex = cycleIndex(currentIndex < 0 ? 0 : currentIndex, direction, ids.length)
  return { ...selection, [partKey]: ids[nextIndex] }
}

export function randomCharacterSelection(seed: number, jobId: JobId): PortraitSelection {
  return { ...randomSelection(seed), outfitId: jobId }
}

export function characterCreatePresentation(name: string, selectedJobId: JobId, ipMode: IpMode): CharacterCreatePresentation {
  const validation = validateCharacterName(name)
  const errorKey = validation.reason === 'too-long' ? 's01.name.tooLong' : validation.reason === null ? null : `s01.name.${validation.reason}`
  return {
    title: t('s01.title', ipMode),
    nameLabel: t('s01.name', ipMode),
    namePlaceholder: t('s01.name.placeholder', ipMode),
    nameError: errorKey === null ? null : t(errorKey, ipMode),
    randomLabel: t('s01.random', ipMode),
    confirmLabel: t('s01.confirm', ipMode),
    canConfirm: validation.valid,
    jobs: JOB_ORDER.map((id) => {
      const job = JOBS[id]
      return {
        id,
        name: job.name,
        description: t(`s01.job.${id}`, ipMode),
        color: JOB_COLORS[id],
        startStats: { hp: job.startHp, mp: job.startMp, attack: job.baseAttack },
        skillName: SKILLS[job.skillId]?.name ?? job.skillId,
        selected: id === selectedJobId,
        intensity: id === selectedJobId ? 1 : 0.6,
      }
    }),
  }
}
