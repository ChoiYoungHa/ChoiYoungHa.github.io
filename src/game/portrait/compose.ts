import rawParts from '../data/portrait-parts.json' with { type: 'json' }
import { mulberry32 } from '../rules/rng.ts'

export interface PortraitShape {
  d: string
  fill: string
  opacity?: number
}

export interface PortraitPart {
  id: string
  name: string
  shapes: PortraitShape[]
}

export interface PortraitHairPart {
  id: string
  name: string
  back: PortraitShape[]
  front: PortraitShape[]
}

export interface PortraitColor {
  id: string
  name: string
  value: string
}

export interface PortraitPartsCatalog {
  viewBox: string
  faceTransform: string
  base: Array<PortraitShape & { id: string }>
  faces: PortraitPart[]
  eyes: PortraitPart[]
  noses: PortraitPart[]
  mouths: PortraitPart[]
  hairs: PortraitHairPart[]
  skinColors: PortraitColor[]
  hairColors: PortraitColor[]
  eyeColors: PortraitColor[]
  outfits: PortraitPart[]
}

export interface PortraitSelection {
  faceId: string
  eyeId: string
  noseId: string
  mouthId: string
  hairId: string
  skinId: string
  hairColorId: string
  eyeColorId: string
  outfitId: string
}

export interface PortraitLayer {
  id: string
  d: string
  fill: string
  opacity?: number
  transform?: string
}

export interface ComposedPortrait {
  viewBox: string
  layers: PortraitLayer[]
}

export const portraitParts = rawParts as unknown as PortraitPartsCatalog

export const DEFAULT_PORTRAIT_SELECTION: PortraitSelection = {
  faceId: 'round',
  eyeId: 'basic',
  noseId: 'dot',
  mouthId: 'smile',
  hairId: 'short',
  skinId: 'skin-warm',
  hairColorId: 'hair-espresso',
  eyeColorId: 'eye-brown',
  outfitId: 'warrior',
}

function selected<T extends { id: string }>(collection: T[], id: string, kind: string): T {
  const part = collection.find((candidate) => candidate.id === id)
  if (part === undefined) throw new Error(`unknown portrait ${kind}: ${id}`)
  return part
}

function resolveFill(fill: string, colors: Record<string, string>): string {
  if (!fill.startsWith('$')) return fill
  const color = colors[fill.slice(1)]
  if (color === undefined) throw new Error(`unknown portrait fill slot: ${fill}`)
  return color
}

function layersFor(
  prefix: string,
  partId: string,
  shapes: PortraitShape[],
  colors: Record<string, string>,
  transform?: string,
): PortraitLayer[] {
  return shapes.map((shape, index) => ({
    id: `${prefix}:${partId}:${index}`,
    d: shape.d,
    fill: resolveFill(shape.fill, colors),
    ...(shape.opacity === undefined ? {} : { opacity: shape.opacity }),
    ...(transform === undefined ? {} : { transform }),
  }))
}

export function composePortrait(
  selection: PortraitSelection,
  parts: PortraitPartsCatalog = portraitParts,
): ComposedPortrait {
  const face = selected(parts.faces, selection.faceId, 'face')
  const eyes = selected(parts.eyes, selection.eyeId, 'eyes')
  const nose = selected(parts.noses, selection.noseId, 'nose')
  const mouth = selected(parts.mouths, selection.mouthId, 'mouth')
  const hair = selected(parts.hairs, selection.hairId, 'hair')
  const outfit = selected(parts.outfits, selection.outfitId, 'outfit')
  const skin = selected(parts.skinColors, selection.skinId, 'skin color')
  const hairColor = selected(parts.hairColors, selection.hairColorId, 'hair color')
  const eyeColor = selected(parts.eyeColors, selection.eyeColorId, 'eye color')
  const colors = { skin: skin.value, hair: hairColor.value, eye: eyeColor.value }
  const transform = parts.faceTransform
  const faceLayers = layersFor('face', face.id, face.shapes, colors, transform)

  return {
    viewBox: parts.viewBox,
    layers: [
      ...parts.base.map((shape): PortraitLayer => ({
        id: `base:${shape.id}`,
        d: shape.d,
        fill: resolveFill(shape.fill, colors),
        ...(shape.opacity === undefined ? {} : { opacity: shape.opacity }),
      })),
      ...layersFor('outfit', outfit.id, outfit.shapes, colors),
      ...layersFor('hair-back', hair.id, hair.back, colors, transform),
      ...faceLayers,
      ...faceLayers.map((layer) => ({
        ...layer,
        id: `${layer.id}:shade`,
        fill: 'rgba(122,74,42,0.28)',
      })),
      ...layersFor('eye', eyes.id, eyes.shapes, colors, transform),
      ...layersFor('nose', nose.id, nose.shapes, colors, transform),
      ...layersFor('mouth', mouth.id, mouth.shapes, colors, transform),
      ...layersFor('hair-front', hair.id, hair.front, colors, transform),
    ],
  }
}

function randomId<T extends { id: string }>(items: T[], rng: () => number): string {
  return items[Math.floor(rng() * items.length)].id
}

export function randomSelection(seed: number): PortraitSelection {
  const rng = mulberry32(seed)
  return {
    faceId: randomId(portraitParts.faces, rng),
    eyeId: randomId(portraitParts.eyes, rng),
    noseId: randomId(portraitParts.noses, rng),
    mouthId: randomId(portraitParts.mouths, rng),
    hairId: randomId(portraitParts.hairs, rng),
    skinId: randomId(portraitParts.skinColors, rng),
    hairColorId: randomId(portraitParts.hairColors, rng),
    eyeColorId: randomId(portraitParts.eyeColors, rng),
    outfitId: randomId(portraitParts.outfits, rng),
  }
}
