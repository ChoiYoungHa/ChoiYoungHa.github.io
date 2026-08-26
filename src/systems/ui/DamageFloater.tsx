import { damageFloaterPresentation, type DamageFloaterState } from './damageFloaterLogic.ts'
import { HUD_TOKENS } from './hudTokens.ts'

export interface DamageFloaterProps {
  state: DamageFloaterState
  nowMs: number
}

export function DamageFloater({ state, nowMs }: DamageFloaterProps) {
  return (
    <div aria-label="데미지 플로터" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', fontFamily: HUD_TOKENS.fontFamily }}>
      {damageFloaterPresentation(state, nowMs).map((floater) => <span key={floater.id} style={{ position: 'absolute', left: floater.x, top: floater.y, opacity: floater.opacity, transform: `translate(-50%, -50%) scale(${floater.scale})`, color: floater.color, fontSize: 19, fontWeight: 800, textShadow: '0 2px 5px rgba(0,0,0,0.9)' }}>{floater.text}</span>)}
    </div>
  )
}
