import fxData from '../data/fx.json' with { type: 'json' }
import {
  acquire,
  activeValues,
  createPool,
  type AcquireResult,
  type PoolState,
} from '../util/pool.ts'

export type FxSkillId = keyof typeof fxData.skills
export type FxAttachment =
  | 'player-front'
  | 'impact-point'
  | 'target-above'
  | 'target-body'
  | 'landing-point'
export type FxCellRect = readonly [u: number, v: number, width: number, height: number]
export type FxScale = readonly [width: number, height: number]

interface FxLayerDefinition {
  id: string
  cellRects: readonly FxCellRect[]
  frameCount: number
  frameIntervalMs: number
  startMs: number
  lifetimeMs: number
  instanceCount?: number
  instanceStaggerMs?: number
  instanceLifetimeMs?: number
  attachment?: FxAttachment
  scale: FxScale
}

interface FxSkillDefinition {
  attachment: FxAttachment
  lifetimeMs: number
  instanceColors: readonly string[]
  layers: readonly FxLayerDefinition[]
}

export interface FxInstance {
  skillId: FxSkillId
  startedAtMs: number
}

export interface FxLayerSample {
  id: string
  active: boolean
  frameIndex: number
  cellRect: FxCellRect
  scale: FxScale
  attachment: FxAttachment
  instanceColors: readonly string[]
  instances: FxLayerInstanceSample[]
}

export interface FxLayerInstanceSample {
  instanceIndex: number
  active: boolean
  elapsedMs: number
}

export interface FxSample {
  active: boolean
  elapsedMs: number
  layers: FxLayerSample[]
}

export type FxPool = PoolState<FxInstance>
export const FX_POOL_CAPACITY = fxData.maxConcurrent

const skills = fxData.skills as unknown as Record<FxSkillId, FxSkillDefinition>

function assertFiniteTime(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`)
}

function isFxSkillId(value: string): value is FxSkillId {
  return Object.hasOwn(skills, value)
}

export function spawnFx(skillId: string, startedAtMs: number): FxInstance {
  if (!isFxSkillId(skillId)) throw new RangeError(`unknown FX skill: ${skillId}`)
  assertFiniteTime(startedAtMs, 'startedAtMs')
  return { skillId, startedAtMs }
}

export function sampleFx(instance: FxInstance, timeMs: number): FxSample {
  assertFiniteTime(timeMs, 'timeMs')
  const definition = skills[instance.skillId]
  const elapsedMs = timeMs - instance.startedAtMs
  if (elapsedMs < 0 || elapsedMs >= definition.lifetimeMs) {
    return { active: false, elapsedMs, layers: [] }
  }

  const layers = definition.layers
    .filter((layer) => elapsedMs >= layer.startMs)
    .map((layer): FxLayerSample => {
      const layerElapsedMs = elapsedMs - layer.startMs
      const instanceCount = layer.instanceCount ?? 1
      const instanceStaggerMs = layer.instanceStaggerMs ?? 0
      const instanceLifetimeMs = layer.instanceLifetimeMs ?? layer.lifetimeMs
      const instances = Array.from({ length: instanceCount }, (_, instanceIndex) => {
        const instanceElapsedMs = layerElapsedMs - instanceIndex * instanceStaggerMs
        return {
          instanceIndex,
          active: instanceElapsedMs >= 0 && instanceElapsedMs < instanceLifetimeMs,
          elapsedMs: instanceElapsedMs,
        }
      })
      const active = layerElapsedMs < layer.lifetimeMs && instances.some((instance) => instance.active)
      const frameIndex = Math.min(
        layer.frameCount - 1,
        Math.floor(layerElapsedMs / layer.frameIntervalMs),
      )
      return {
        id: layer.id,
        active,
        frameIndex,
        cellRect: layer.cellRects[frameIndex],
        scale: layer.scale,
        attachment: layer.attachment ?? definition.attachment,
        instanceColors: definition.instanceColors,
        instances,
      }
    })

  return { active: true, elapsedMs, layers }
}

export function createFxPool(): FxPool {
  return createPool<FxInstance>(FX_POOL_CAPACITY)
}

export function enqueueFx(
  pool: FxPool,
  skillId: string,
  startedAtMs: number,
): AcquireResult<FxInstance> {
  return acquire(pool, spawnFx(skillId, startedAtMs), startedAtMs)
}

export function activeFx(pool: FxPool): FxInstance[] {
  return activeValues(pool)
}
