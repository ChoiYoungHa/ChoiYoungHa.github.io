import rawZones from '../data/zones.json' with { type: 'json' }

export type ZoneId = 'forest' | 'village' | 'park'

export interface WorldPosition {
  x: number
  z: number
}

interface CircleZone {
  shape: 'circle'
  center: WorldPosition
  radiusMeters: number
  excludes: ZoneId[]
  source: string
}

interface AabbZone {
  shape: 'aabb'
  min: WorldPosition
  max: WorldPosition
  marginMeters: number
  excludes: ZoneId[]
  source: string
}

type ZoneDefinition = CircleZone | AabbZone

interface ZoneData {
  hysteresisMeters: number
  priority: ZoneId[]
  zones: Record<ZoneId, ZoneDefinition>
}

export interface ZoneStepState {
  zone: ZoneId | null
}

export interface ZoneEvent {
  type: 'enter' | 'exit'
  zone: ZoneId
}

export interface ZoneStepResult {
  state: ZoneStepState
  events: ZoneEvent[]
}

const zoneData = rawZones as unknown as ZoneData

function containsRaw(zone: ZoneDefinition, position: WorldPosition, margin: number): boolean {
  if (zone.shape === 'circle') {
    const radius = Math.max(0, zone.radiusMeters + margin)
    return Math.hypot(position.x - zone.center.x, position.z - zone.center.z) <= radius
  }
  return position.x >= zone.min.x - margin
    && position.x <= zone.max.x + margin
    && position.z >= zone.min.z - margin
    && position.z <= zone.max.z + margin
}

function containsEffective(zoneId: ZoneId, position: WorldPosition, margin: number): boolean {
  const zone = zoneData.zones[zoneId]
  if (!containsRaw(zone, position, margin)) return false
  return zone.excludes.every((excludedId) => {
    const excluded = zoneData.zones[excludedId]
    return !containsRaw(excluded, position, -margin)
  })
}

export function classify(position: WorldPosition): ZoneId | null {
  return zoneData.priority.find((zoneId) => containsEffective(zoneId, position, 0)) ?? null
}

export function step(previous: ZoneStepState, position: WorldPosition): ZoneStepResult {
  if (
    previous.zone !== null
    && containsEffective(previous.zone, position, zoneData.hysteresisMeters)
  ) {
    return { state: previous, events: [] }
  }

  const nextZone = classify(position)
  if (nextZone === previous.zone) return { state: previous, events: [] }

  const events: ZoneEvent[] = []
  if (previous.zone !== null) events.push({ type: 'exit', zone: previous.zone })
  if (nextZone !== null) events.push({ type: 'enter', zone: nextZone })
  return { state: { zone: nextZone }, events }
}
