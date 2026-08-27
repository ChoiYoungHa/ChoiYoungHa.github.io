let ready = false
const listeners = new Set<() => void>()

export function setGameRuntimeReady(value: boolean): void {
  if (ready === value) return
  ready = value
  listeners.forEach((listener) => listener())
}

export function readGameRuntimeReady(): boolean {
  return ready
}

export function subscribeGameRuntimeReady(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
