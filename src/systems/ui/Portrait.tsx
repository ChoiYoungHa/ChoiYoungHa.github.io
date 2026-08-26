import { composePortrait, type PortraitSelection } from '../../game/portrait/compose.ts'

export interface PortraitProps {
  selection: PortraitSelection
  size?: number
}

export function Portrait({ selection, size = 256 }: PortraitProps) {
  const portrait = composePortrait(selection)
  return (
    <svg aria-label="캐릭터 초상" height={size} role="img" viewBox="0 0 256 256" width={size} xmlns="http://www.w3.org/2000/svg">
      {portrait.layers.map((layer) => (
        <path d={layer.d} fill={layer.fill} key={layer.id} opacity={layer.opacity} transform={layer.transform} />
      ))}
    </svg>
  )
}
