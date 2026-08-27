import fxData from '../../game/data/fx.json' with { type: 'json' }
import { forwardFromYaw } from '../../player/input.ts'
import {
  sampleFx,
  spawnFx,
  type FxAttachment,
  type FxBillboard,
  type FxCellRect,
  type FxSkillId,
} from '../../game/rules/fxTimeline.ts'

export interface FxPoint {
  x: number
  y?: number
  z: number
}

export interface FxSpawnEvent {
  type: 'fx-spawn'
  sequence: number
  atMs: number
  skillId: FxSkillId
  mobId?: string
  position?: FxPoint
  playerYaw?: number
  targetPosition?: FxPoint
  impactPosition?: FxPoint
  landingPosition?: FxPoint
}

export interface LevelUpEvent {
  type: 'level-up'
  sequence: number
  atMs: number
}

export interface FxEventLike {
  type: string
  sequence: number
  atMs: number
  skillId?: string
  mobId?: string
  position?: FxPoint
  playerYaw?: number
  targetPosition?: FxPoint
  impactPosition?: FxPoint
  landingPosition?: FxPoint
}

export interface FxRenderAnchors {
  playerPosition: FxPoint
  playerYaw: number
  targetPositions: Readonly<Record<string, FxPoint>>
}

export interface FxRenderInstance {
  uvRect: FxCellRect
  color: readonly [number, number, number]
  frame: number
  life: number
  position: Required<FxPoint>
  scale: readonly [number, number]
  billboard: FxBillboard | 'ground'
}

interface FxSpawnRecord extends FxSpawnEvent {}

export interface FxRenderState {
  lastSequence: number
  lastNowMs: number
  spawns: FxSpawnRecord[]
}

export interface LevelUpRenderState {
  lastSequence: number
  lastNowMs: number
  startedAtMs: number | null
}

const skillDefinitions = fxData.skills as unknown as Record<FxSkillId, {
  projectileCount?: number
  layers: readonly { instanceCount?: number }[]
}>
const maxLayerInstances = Math.max(...Object.values(skillDefinitions).map(({ layers, projectileCount }) =>
  layers.reduce((sum, layer) => sum + (layer.instanceCount ?? projectileCount ?? 1), 0)))

export const FX_INSTANCE_CAPACITY = fxData.maxConcurrent * maxLayerInstances
export const LEVEL_UP_RING_COUNT = 3
export const LEVEL_UP_DURATION_MS = 1_200
const LEVEL_UP_RING_STAGGER_MS = 200
const LEVEL_UP_RING_LIFETIME_MS = 800
const LEVEL_UP_RING_RECT = [0.75, 0.75, 0.25, 0.25] as const

function rgb(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  const linear = (channel: number) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return [linear((value >> 16) & 0xff), linear((value >> 8) & 0xff), linear(value & 0xff)]
}

function roundedLife(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000_000) / 1_000_000
}

function point(source: FxPoint | undefined, y: number): Required<FxPoint> {
  return { x: source?.x ?? 0, y, z: source?.z ?? 0 }
}

function resolveAttachment(
  attachment: FxAttachment,
  spawn: FxSpawnRecord,
  anchors: FxRenderAnchors,
  instanceIndex: number,
  instanceCount: number,
): Required<FxPoint> {
  const target = spawn.mobId === undefined ? undefined : anchors.targetPositions[spawn.mobId]
  const lateral = (instanceIndex - (instanceCount - 1) * 0.5) * 0.35
  if (attachment === 'player-front') {
    const forward = forwardFromYaw(anchors.playerYaw)
    return {
      x: anchors.playerPosition.x + forward.x * 2 - forward.z * lateral,
      y: 1.1,
      z: anchors.playerPosition.z + forward.z * 2 + forward.x * lateral,
    }
  }
  const spread = (source: FxPoint | undefined, y: number) => {
    const resolved = point(source, y)
    return { ...resolved, x: resolved.x + lateral }
  }
  if (attachment === 'impact-point') return spread(spawn.impactPosition ?? target ?? spawn.targetPosition, 1)
  if (attachment === 'target-above') return spread(target ?? spawn.targetPosition ?? spawn.impactPosition, 2.2)
  if (attachment === 'target-body') return spread(target ?? spawn.targetPosition ?? spawn.impactPosition, 1)
  return point(spawn.landingPosition ?? spawn.impactPosition ?? spawn.position, 0.1)
}

export function createFxRenderState(): FxRenderState {
  return { lastSequence: -1, lastNowMs: -1, spawns: [] }
}

export function stepFxRenderState(
  state: FxRenderState,
  events: readonly FxEventLike[],
  nowMs: number,
  anchors: FxRenderAnchors,
): { state: FxRenderState, instances: FxRenderInstance[] } {
  const reset = nowMs < state.lastNowMs
  let spawns = reset ? [] : [...state.spawns]
  let lastSequence = reset ? -1 : state.lastSequence
  for (const event of events) {
    if (event.sequence <= lastSequence) continue
    lastSequence = Math.max(lastSequence, event.sequence)
    if (event.type !== 'fx-spawn') continue
    const spawned = spawnFx(event.skillId ?? '', event.atMs)
    spawns.push({ ...event, type: 'fx-spawn', skillId: spawned.skillId })
  }
  spawns = spawns
    .filter((spawn) => sampleFx(spawnFx(spawn.skillId, spawn.atMs), nowMs).active)
    .slice(-fxData.maxConcurrent)

  const instances = spawns.flatMap((spawn) => {
    const sample = sampleFx(spawnFx(spawn.skillId, spawn.atMs), nowMs)
    return sample.layers.flatMap((layer, layerIndex) => {
      if (!layer.active) return []
      return layer.instances.flatMap((instance) => instance.active ? [{
        uvRect: layer.baseCellRect,
        color: rgb(layer.instanceColors[(layerIndex + instance.instanceIndex) % layer.instanceColors.length]),
        frame: layer.frameIndex,
        life: roundedLife(instance.life),
        position: resolveAttachment(layer.attachment, spawn, anchors, instance.instanceIndex, layer.instances.length),
        scale: layer.scale,
        billboard: layer.billboard,
      } satisfies FxRenderInstance] : [])
    })
  }).slice(0, FX_INSTANCE_CAPACITY)

  return { state: { lastSequence, lastNowMs: nowMs, spawns }, instances }
}

export function createLevelUpRenderState(): LevelUpRenderState {
  return { lastSequence: -1, lastNowMs: -1, startedAtMs: null }
}

export function stepLevelUpRenderState(
  state: LevelUpRenderState,
  events: readonly (LevelUpEvent | { type: string, sequence: number, atMs: number })[],
  nowMs: number,
  playerPosition: FxPoint,
): { state: LevelUpRenderState, instances: FxRenderInstance[] } {
  const reset = nowMs < state.lastNowMs
  let startedAtMs = reset ? null : state.startedAtMs
  let lastSequence = reset ? -1 : state.lastSequence
  for (const event of events) {
    if (event.sequence <= lastSequence) continue
    lastSequence = Math.max(lastSequence, event.sequence)
    if (event.type === 'level-up') startedAtMs = event.atMs
  }
  if (startedAtMs === null || nowMs - startedAtMs >= LEVEL_UP_DURATION_MS) {
    return { state: { lastSequence, lastNowMs: nowMs, startedAtMs }, instances: [] }
  }

  const instances: FxRenderInstance[] = []
  for (let index = 0; index < LEVEL_UP_RING_COUNT; index += 1) {
    const elapsedMs = nowMs - startedAtMs - index * LEVEL_UP_RING_STAGGER_MS
    if (elapsedMs < 0 || elapsedMs >= LEVEL_UP_RING_LIFETIME_MS) continue
    const progress = elapsedMs / LEVEL_UP_RING_LIFETIME_MS
    instances.push({
      uvRect: LEVEL_UP_RING_RECT,
      color: [1, 0.82, 0.3] as const,
      frame: 0,
      life: roundedLife(1 - progress),
      position: { x: playerPosition.x, y: 0.15 + progress * 2.2, z: playerPosition.z },
      scale: [1.2 + progress * 1.8, 1.2 + progress * 1.8] as const,
      billboard: 'ground' as const,
    })
  }

  return { state: { lastSequence, lastNowMs: nowMs, startedAtMs }, instances }
}
