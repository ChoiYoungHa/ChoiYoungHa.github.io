import mainPath from '../../data/main-path.json' with { type: 'json' }
import placement from '../../data/placement.json' with { type: 'json' }
import zoneData from '../../game/data/zones.json' with { type: 'json' }
import { HUD_TOKENS } from './hudTokens.ts'

/** 좌상단 미니맵(2026-08-27 영하님): 지역명 + 길·마을·공원·NPC·포탈·플레이어 방향. 월드 XZ → 220×140 픽셀. */
export interface MiniMapProps {
  zoneName: string
  player: { x: number; z: number; yaw: number }
  npcs: readonly { id: string; label: string; x: number; z: number }[]
  warps: readonly { id: string; x: number; z: number }[]
}

const W = 220
const H = 140
const BOUNDS = { minX: -130, maxX: 60, minZ: -110, maxZ: 45 }
const SX = W / (BOUNDS.maxX - BOUNDS.minX)
const SZ = H / (BOUNDS.maxZ - BOUNDS.minZ)
const px = (x: number) => (x - BOUNDS.minX) * SX
const pz = (z: number) => (z - BOUNDS.minZ) * SZ
const ROAD = (mainPath.waypoints as unknown as Array<{ x: number; z: number }>).map((w) => `${px(w.x).toFixed(1)},${pz(w.z).toFixed(1)}`).join(' ')
const HOUSES = (placement.village as unknown as Array<{ position: [number, number] }>).map((h) => h.position)
const PARK = zoneData.zones.park as { center: { x: number; z: number }; radiusMeters: number }
const FOREST = zoneData.zones.forest as { center: { x: number; z: number }; radiusMeters: number }
const HERO = placement.heroTree as { x: number; z: number }

export function MiniMap({ zoneName, player, npcs, warps }: MiniMapProps) {
  // 컨트롤러 규약: 정면(-Z) = yaw 0. 미니맵은 위가 -Z 이므로 화살표 회전 = -yaw.
  const angle = (-player.yaw * 180) / Math.PI
  return (
    <section aria-label="미니맵" style={{ position: 'absolute', left: 16, top: 16, width: W, background: HUD_TOKENS.colors.panel, border: `1px solid ${HUD_TOKENS.colors.border}`, borderRadius: 8, overflow: 'hidden', fontFamily: HUD_TOKENS.fontFamily, color: HUD_TOKENS.colors.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, background: 'rgba(0,0,0,0.35)' }}>
        <span style={{ color: '#7fd7ff', fontSize: 9, letterSpacing: '0.2em' }}>MINI MAP</span>
        <span data-testid="minimap-zone">{zoneName}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="미니맵 지도">
        <rect width={W} height={H} fill="#1f2a1d" />
        <circle cx={px(FOREST.center.x)} cy={pz(FOREST.center.z)} r={FOREST.radiusMeters * SX} fill="#2f4a2a" />
        <circle cx={px(PARK.center.x)} cy={pz(PARK.center.z)} r={PARK.radiusMeters * SX} fill="#4a3a52" />
        <polyline points={ROAD} fill="none" stroke="#c9b27a" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {HOUSES.map(([x, z], i) => <rect key={i} x={px(x) - 3} y={pz(z) - 3} width={6} height={6} fill="#d95a4a" />)}
        <circle cx={px(HERO.x)} cy={pz(HERO.z)} r={5} fill="#3c9a4a" stroke="#1e4d25" />
        {warps.map((w) => <circle key={w.id} cx={px(w.x)} cy={pz(w.z)} r={3.5} fill="#7fd7ff" stroke="#0b2a3a" />)}
        {npcs.map((n) => <circle key={n.id} cx={px(n.x)} cy={pz(n.z)} r={3.5} fill="#78e26b" stroke="#1d4a17" />)}
        <g transform={`translate(${px(player.x).toFixed(1)} ${pz(player.z).toFixed(1)}) rotate(${angle.toFixed(1)})`}>
          <polygon points="0,-7 5,5 0,2 -5,5" fill="#ffd94a" stroke="#4a3a00" strokeWidth={1} />
        </g>
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', padding: '4px 10px 6px', fontSize: 10, color: HUD_TOKENS.colors.muted }}>
        {npcs.map((n) => <span key={n.id}><span style={{ color: '#78e26b' }}>●</span> {n.label}</span>)}
        <span><span style={{ color: '#7fd7ff' }}>●</span> 포탈</span>
      </div>
    </section>
  )
}
