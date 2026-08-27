export function shouldShowRuntimeHud(search: string, gameInputEnabled: boolean): boolean {
  return !gameInputEnabled || new URLSearchParams(search).get('hud') === '1'
}
