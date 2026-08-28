import type { GameplayAction } from '../player/input.ts'
import { setCameraDistanceMultiplier } from './cameraDistance.ts'
import { CAMERA_INTRO_DURATION_MS } from './cameraIntro.ts'
import { requestPlayerAttack, requestPlayerJump, requestPlayerSkill, requestPlayerTeleport, resetGameRuntimeSignals, setCameraIntroElapsedMs } from './runtimeSignals.ts'
import type { GameSession, SessionInputs, SessionPosition, SessionTickResult } from './session.ts'
import { easeDistance } from './world/cameraEase.ts'

interface EdgeInput {
  consumePressed(): GameplayAction[]
  /** 2026-08-28 영하님 "공격이 안 나갈 때가 있다" — 기본공격은 누르고 있으면 쿨다운마다 자동 반복한다(쿨다운 중 누른 입력이 버려지지 않는다). */
  isDown?(action: 'attack'): boolean
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
    else if (action === 'quick3' || action === 'quick4' || action === 'quick5' || action === 'quick6') inputs.quickSlot = Number(action.slice(5)) as 3 | 4 | 5 | 6
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
      if (input.isDown?.('attack') === true) edges.attack = true
      if (Object.keys(edges).length > 0) session.enqueueInput(edges)
      const result = session.tick({
        dtMs: Math.min(frame.dtMs, 50),
        playerPos: frame.playerPos,
        playerYaw: frame.playerYaw,
        inputs: { move: frame.move, run: frame.run },
      })
      for (const event of result.events) {
        if (event.type === 'teleport' && event.warpTo !== undefined) requestPlayerTeleport(event.warpTo)
        // 2026-08-28 — 아바타 모션은 실제로 나간 공격/스킬(fx-spawn)에만 맞춘다.
        // 이전엔 키 edge 마다 휘둘러서 쿨다운·MP 부족으로 거부된 입력도 "휘두르는데 이펙트가 안 나가는" 것처럼 보였다.
        else if (event.type === 'fx-spawn') {
          if (event.skillId === 'basic-attack') requestPlayerAttack()
          else requestPlayerSkill()
        }
      }
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
