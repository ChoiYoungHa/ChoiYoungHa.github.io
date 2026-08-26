import { mobHpBarPresentation, type MobHpBarInput } from './damageFloaterLogic.ts'
import { HUD_TOKENS } from './hudTokens.ts'

export interface MobHpBarProps {
  mobs: readonly MobHpBarInput[]
}

export function MobHpBar({ mobs }: MobHpBarProps) {
  return (
    <div aria-label="몬스터 체력" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', fontFamily: HUD_TOKENS.fontFamily }}>
      {mobHpBarPresentation(mobs).map((mob) => <div key={mob.id} style={{ position: 'absolute', left: mob.screenX, top: mob.screenY, width: 62, transform: 'translate(-50%, -100%)' }}>
        <div style={{ height: 6, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.72)', borderRadius: 4, background: 'rgba(12,12,14,0.78)' }}><div style={{ width: `${mob.percent}%`, height: '100%', background: HUD_TOKENS.colors.hp }} /></div>
      </div>)}
    </div>
  )
}
