/* oxlint-disable react/only-export-components -- smoke probe verifies the preset lookup directly. */
import { useRuntime } from '../store/useRuntime'
import presets from '../data/quality-presets.json'

export const FOG_COLOR = '#8FA0B0'
export type AtmospherePreset = keyof typeof presets

export function getFogDensity(preset: AtmospherePreset): number {
  return presets[preset].fogDensity
}

export function Atmosphere() {
  const preset = useRuntime((state) => state.preset)
  return <fogExp2 attach="fog" args={[FOG_COLOR, getFogDensity(preset)]} />
}
