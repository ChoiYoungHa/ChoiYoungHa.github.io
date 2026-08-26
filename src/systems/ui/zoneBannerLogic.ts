import { t, type IpMode } from '../../game/i18n.ts'
import type { ZoneEvent } from '../../game/world/zones.ts'

export const ZONE_BANNER_DURATION_MS = 4_000
export type BannerZoneId = 'village' | 'park'

export interface ActiveZoneBanner {
  zone: BannerZoneId
  startedAtMs: number
}

export interface ZoneBannerState {
  active: ActiveZoneBanner | null
  queue: BannerZoneId[]
}

export function createZoneBannerState(): ZoneBannerState {
  return { active: null, queue: [] }
}

function bannerZoneFor(event: ZoneEvent): BannerZoneId | null {
  if (event.type !== 'enter') return null
  return event.zone === 'village' || event.zone === 'park' ? event.zone : null
}

export function stepZoneBanner(
  previous: ZoneBannerState,
  nowMs: number,
  events: readonly ZoneEvent[] = [],
): ZoneBannerState {
  const queue = [
    ...previous.queue,
    ...events.map(bannerZoneFor).filter((zone): zone is BannerZoneId => zone !== null),
  ]
  let active = previous.active

  if (active !== null && nowMs - active.startedAtMs >= ZONE_BANNER_DURATION_MS) {
    active = null
  }
  if (active === null && queue.length > 0) {
    const zone = queue.shift()
    if (zone !== undefined) active = { zone, startedAtMs: nowMs }
  }

  return { active, queue }
}

export interface ZoneBannerCopy {
  title: string
  subtitle: string
  largeTitle: string | null
}

export function zoneBannerCopy(zone: BannerZoneId, ipMode: IpMode): ZoneBannerCopy {
  if (zone === 'park') {
    return {
      title: t('s06.enter', ipMode),
      subtitle: t('s06.currentRegion', ipMode),
      largeTitle: t('s06.name', ipMode),
    }
  }
  return {
    title: t('s03.enter', ipMode),
    subtitle: t('s03.location', ipMode),
    largeTitle: null,
  }
}
