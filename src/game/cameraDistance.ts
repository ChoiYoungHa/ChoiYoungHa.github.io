let multiplier = 1

export function setCameraDistanceMultiplier(value: number): void {
  multiplier = Number.isFinite(value) && value > 0 ? value : 1
}

export function readCameraDistanceMultiplier(): number {
  return multiplier
}
