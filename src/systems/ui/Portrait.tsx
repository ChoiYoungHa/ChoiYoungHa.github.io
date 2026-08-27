import { useState } from 'react'
import { composePortrait, type PortraitSelection } from '../../game/portrait/compose.ts'

export interface PortraitProps {
  selection: PortraitSelection
  size?: number
  imageUrl?: string
  alt?: string
}

export function Portrait({ selection, size = 256, imageUrl, alt = '캐릭터 초상' }: PortraitProps) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null)
  if (imageUrl !== undefined && failedImageUrl !== imageUrl) {
    return (
      <img
        alt={alt}
        height={size}
        onError={() => setFailedImageUrl(imageUrl)}
        src={imageUrl}
        style={{ display: 'block', objectFit: 'contain' }}
        width={size}
      />
    )
  }
  const portrait = composePortrait(selection)
  return (
    <svg aria-label={alt} height={size} role="img" viewBox="0 0 256 256" width={size} xmlns="http://www.w3.org/2000/svg">
      {portrait.layers.map((layer) => (
        <path d={layer.d} fill={layer.fill} key={layer.id} opacity={layer.opacity} transform={layer.transform} />
      ))}
    </svg>
  )
}
