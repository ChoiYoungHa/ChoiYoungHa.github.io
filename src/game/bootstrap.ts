import { GAME_INPUT_ENABLED, isGameInputEnabled } from '../player/input.ts'
import { useGame } from '../store/useGame.ts'
import { parseSceneQuery } from './flow.ts'
import { resolveIpMode, type IpMode } from './i18n.ts'
import { createSession, type GameSession } from './session.ts'
import type { GameScene } from './state.ts'

export interface GameBootstrapConfig {
  enabled: boolean
  initialScene: GameScene | null
  ipMode: IpMode
  /** `?boss=1`(PROD 제외): 보스 즉시 각성 — 보스 연출·프로브용. */
  bossAwake: boolean
}

export interface GameBootstrap extends GameBootstrapConfig {
  enabled: true
  session: GameSession
  dispose(): void
}

export function parseGameBootstrapConfig(
  input: string,
  viteGame = '',
  production = false,
): GameBootstrapConfig {
  const url = new URL(input, 'https://local.invalid')
  const requestedIp = url.searchParams.get('ip') === 'conti' ? 'conti' : 'own'
  const enabled = isGameInputEnabled(url.search, viteGame)
  return {
    enabled,
    initialScene: enabled && !production ? parseSceneQuery(url.href) : null,
    ipMode: resolveIpMode(requestedIp, production),
    bossAwake: enabled && !production && url.searchParams.get('boss') === '1',
  }
}

export function createGameBootstrap(config: GameBootstrapConfig): GameBootstrap | null {
  if (!config.enabled) return null
  const session = createSession({
    seed: 45,
    ipMode: config.ipMode,
    initialScene: config.initialScene ?? undefined,
    bossAwake: config.bossAwake,
  })
  const unbind = session.bind(useGame)
  return { ...config, enabled: true, session, dispose: unbind }
}

const href = typeof location === 'undefined' ? 'https://local.invalid/' : location.href
export const gameBootstrap = createGameBootstrap(parseGameBootstrapConfig(
  href,
  GAME_INPUT_ENABLED ? '1' : '',
  import.meta.env?.PROD === true,
))
