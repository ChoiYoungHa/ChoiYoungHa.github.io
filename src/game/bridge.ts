import type { GameplayAction } from '../player/input.ts'
import { setCameraDistanceMultiplier } from './cameraDistance.ts'
import { CAMERA_INTRO_DURATION_MS } from './cameraIntro.ts'
import { requestPlayerJump, resetGameRuntimeSignals, setCameraIntroElapsedMs } from './runtimeSignals.ts'
import type { GameSession, SessionInputs, SessionPosition, SessionTickResult } from './session.ts'
import { easeDistance } from './world/cameraEase.ts'

interface EdgeInput {
  consumePressed(): GameplayAction[]
}

const JUMP_SCENES = new Set(['forest', 'henesys', 'park', 'hunt', 'complete', 'free'])

export interface GameFrameInput {
  dtMs: number
  playerPos: SessionPosition
  playerYaw: number
  move: boolean
  run: boolean
}

export { readCameraDistanceMultiplier } from './cameraDistance.ts'

function edgeInputs(actions: readonly GameplayAction[], dialogueOpen: boolean): SessionInputs {
  const inputs: SessionInputs = {}
  for (const action of actions) {
    if (action === 'jump') inputs[dialogueOpen ? 'confirm' : 'jump'] = true
    else inputs[action] = true
  }
  return inputs
}

export function createGameFrameBridge(session: GameSession, input: EdgeInput) {
  let cameraEaseStartedAtMs: number | null = null
  let cameraIntroStartedAtMs: number | null = null
  return {
    tick(frame: GameFrameInput): SessionTickResult {
      const snapshot = session.getSnapshot()
      const actions = input.consumePressed()
      if (snapshot.activeDialogue === null && JUMP_SCENES.has(snapshot.game.scene) && actions.includes('jump')) {
        requestPlayerJump()
      }
      const edges = edgeInputs(actions, snapshot.activeDialogue !== null)
      if (Object.keys(edges).length > 0) session.enqueueInput(edges)
      const result = session.tick({
        dtMs: Math.min(frame.dtMs, 50),
        playerPos: frame.playerPos,
        playerYaw: frame.playerYaw,
        inputs: { move: frame.move, run: frame.run },
      })
      if (cameraEaseStartedAtMs === null && result.events.some(({ type }) => type === 'camera-ease-start')) {
        cameraEaseStartedAtMs = result.snapshot.nowMs
      }
      if (cameraEaseStartedAtMs !== null) {
        setCameraDistanceMultiplier(easeDistance(
          (result.snapshot.nowMs - cameraEaseStartedAtMs) / 1000,
        ) / easeDistance(0))
      }
      if (result.snapshot.game.scene === 'title') cameraIntroStartedAtMs = null
      else if (cameraIntroStartedAtMs === null && result.snapshot.game.scene === 'forest') {
        cameraIntroStartedAtMs = result.snapshot.nowMs
      }
      const introElapsed = cameraIntroStartedAtMs === null
        ? null
        : result.snapshot.nowMs - cameraIntroStartedAtMs
      setCameraIntroElapsedMs(introElapsed !== null && introElapsed < CAMERA_INTRO_DURATION_MS ? introElapsed : null)
      return result
    },
    dispose(): void {
      setCameraDistanceMultiplier(1)
      resetGameRuntimeSignals()
    },
  }
}
