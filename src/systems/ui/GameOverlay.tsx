import { useEffect, useMemo, useRef, useState } from 'react'
import type { PortraitSelection } from '../../game/portrait/compose.ts'
import { gameBootstrap } from '../../game/bootstrap.ts'
import { DEFAULT_PORTRAIT_SELECTION } from '../../game/portrait/compose.ts'
import type { GameSession, SessionSnapshot } from '../../game/session.ts'
import type { JobId } from '../../game/state.ts'
import placement from '../../data/placement.json' with { type: 'json' }
import { findInteractable } from '../../game/world/interact.ts'
import { useGame, selectHudProps, selectScene } from '../../store/useGame.ts'
import { useRuntime } from '../../store/useRuntime.ts'
import type { LoadingState } from '../loading.ts'
import { CharacterCreate } from './CharacterCreate.tsx'
import { cyclePortraitPart, randomCharacterSelection, type PortraitPartKey } from './characterCreateLogic.ts'
import { DamageFloater } from './DamageFloater.tsx'
import { createDamageFloaterState, mobHpBarInput, stepDamageFloaters } from './damageFloaterLogic.ts'
import { DialoguePanel } from './DialoguePanel.tsx'
import { Epilogue } from './Epilogue.tsx'
import { GameHud } from './GameHud.tsx'
import { InventoryPanel } from './InventoryPanel.tsx'
import { InteractPrompt } from './InteractPrompt.tsx'
import { MobHpBar } from './MobHpBar.tsx'
import { RewardPopup } from './RewardPopup.tsx'
import { ShopPanel } from './ShopPanel.tsx'
import { TitleScreen } from './TitleScreen.tsx'
import { TutorialHints } from './TutorialHints.tsx'
import { ZoneBanner } from './ZoneBanner.tsx'
import { gameProjector, type GameProjector } from './projector.ts'

const JOBS: readonly JobId[] = ['warrior', 'archer', 'mage', 'thief']
const NPCS = placement.npcs.map((npc) => ({
  id: npc.id,
  position: { x: npc.position[0], z: npc.position[1] },
}))

export type { GameProjector, ProjectedPoint } from './projector.ts'

export interface GameOverlayProps {
  session: GameSession
  loading: LoadingState
  backend: string
  preset: string
  projector: GameProjector
  bgUrl?: string
}

export interface GameOverlayRuntimeProps {
  loading: LoadingState
  preset: string
}

function useSessionSnapshot(session: GameSession): SessionSnapshot {
  const [snapshot, setSnapshot] = useState(() => session.getSnapshot())
  useEffect(() => session.subscribe(() => setSnapshot(session.getSnapshot())), [session])
  return snapshot
}

function nextJob(jobId: JobId, direction: -1 | 1): JobId {
  const index = JOBS.indexOf(jobId)
  return JOBS[(index + direction + JOBS.length) % JOBS.length]
}

/** DOM-only composition root. The world supplies time, input, position and projection. */
export function GameOverlay({ session, loading, backend, preset, projector, bgUrl }: GameOverlayProps) {
  const snapshot = useSessionSnapshot(session)
  const game = useGame()
  const scene = selectScene(game)
  const hud = selectHudProps(game)
  const [name, setName] = useState('영하')
  const [jobId, setJobId] = useState<JobId>('archer')
  const [portrait, setPortrait] = useState<PortraitSelection>({
    ...DEFAULT_PORTRAIT_SELECTION,
    outfitId: 'archer',
  })
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
  const randomSeed = useRef(95)

  const floaters = useMemo(() => {
    let state = createDamageFloaterState()
    for (const event of snapshot.recentEvents) {
      if (event.type !== 'floater' || event.position === undefined || event.damage === undefined) continue
      const screen = projector(event.position)
      if (screen.visible === false) continue
      state = stepDamageFloaters(state, event.atMs, [{
        id: `hit-${event.sequence}`,
        damage: event.damage,
        critical: event.critical ?? false,
        screenX: screen.x,
        screenY: screen.y,
      }])
    }
    return stepDamageFloaters(state, snapshot.nowMs)
  }, [projector, snapshot.nowMs, snapshot.recentEvents])
  const mobBars = snapshot.spawner.slots.flatMap((slot) => {
    const mob = slot.mob
    if (mob === null || mob.state === 'dead') return []
    const screen = projector({ ...mob.position, y: 1.4 })
    return screen.visible === false ? [] : [mobHpBarInput(mob, screen.x, screen.y)]
  })
  const interactableId = snapshot.activeDialogue === null
    ? findInteractable(snapshot.playerPos, snapshot.playerYaw, NPCS)
    : null

  const overlay = scene === 'title' ? (
    <TitleScreen bgUrl={bgUrl} loading={loading} backend={backend} preset={preset} ipMode={game.ipMode} onStart={() => session.enqueueInput({ confirm: true })} />
  ) : scene === 'create' ? (
    <CharacterCreate
      name={name}
      selectedJobId={jobId}
      portrait={portrait}
      ipMode={game.ipMode}
      onNameChange={setName}
      onSelectJob={(next) => { setJobId(next); setPortrait((value) => ({ ...value, outfitId: next })) }}
      onPrev={() => setJobId((value) => nextJob(value, -1))}
      onNext={() => setJobId((value) => nextJob(value, 1))}
      onCyclePart={(key: PortraitPartKey, direction) => setPortrait((value) => cyclePortraitPart(value, key, direction))}
      onRandom={() => { randomSeed.current += 1; setPortrait(randomCharacterSelection(randomSeed.current, jobId)) }}
      onConfirm={(selection) => session.enqueueInput({ confirm: true, character: { jobId: selection.jobId, name: selection.name, faceParts: selection.portrait } })}
    />
  ) : null

  return (
    <div data-game-overlay="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {overlay}
      {scene === 'forest' && <TutorialHints inputEvents={snapshot.tutorialEvents} narrationLineIndex={snapshot.nowMs < 2_400 ? 0 : snapshot.nowMs < 4_800 ? 1 : null} ipMode={game.ipMode} />}
      {scene !== 'title' && scene !== 'create' && scene !== 'epilogue' && <GameHud {...hud} zone={snapshot.zone ?? 'forest'} dialogueOpen={snapshot.activeDialogue !== null} />}
      <ZoneBanner banner={snapshot.banner} ipMode={game.ipMode} />
      <InteractPrompt interactableId={interactableId} />
      {snapshot.activeDialogue !== null && <DialoguePanel state={snapshot.activeDialogue} ipMode={game.ipMode} onAdvance={() => session.enqueueInput({ confirm: true })} onChoose={(choice) => session.enqueueInput({ choice })} nowMs={snapshot.nowMs} />}
      {scene === 'shop' && game.jobId !== null && <ShopPanel state={{ jobId: game.jobId, meso: game.meso, inventory: game.inventory }} selectedItemId={snapshot.selectedShopItemId} ipMode={game.ipMode} onSelect={(selectedItemId) => session.enqueueInput({ selectedItemId })} onPurchase={(result) => { if (result.ok) session.enqueueInput({ confirm: true, selectedItemId: snapshot.selectedShopItemId ?? undefined }) }} onAfterPurchase={() => undefined} />}
      <InventoryPanel open={snapshot.inventoryOpen} inventory={game.inventory} hoveredSlotIndex={hoveredSlot} acquiredAtByItemId={snapshot.acquiredAtByItemId} nowMs={snapshot.nowMs} ipMode={game.ipMode} onHoverSlot={setHoveredSlot} onEquip={(equipItemId) => session.enqueueInput({ equipItemId })} />
      <RewardPopup visible={snapshot.reward !== null} ipMode={game.ipMode} previousLevel={snapshot.reward?.previousLevel ?? game.level} currentLevel={snapshot.reward?.currentLevel ?? game.level} onClose={() => session.enqueueInput({ closeReward: true })} />
      {scene === 'epilogue' && <Epilogue elapsedMs={snapshot.nowMs - (snapshot.epilogueStartedAtMs ?? snapshot.nowMs)} ipMode={game.ipMode} onRetry={() => session.enqueueInput({ epilogueAction: 'retry' })} onFreeExplore={() => session.enqueueInput({ epilogueAction: 'free' })} />}
      <DamageFloater state={floaters} nowMs={snapshot.nowMs} />
      <MobHpBar mobs={mobBars} />
    </div>
  )
}

export default function GameOverlayRuntime(props: GameOverlayRuntimeProps) {
  const backend = useRuntime((state) => state.backend)
  return gameBootstrap === null ? null : (
    <GameOverlay {...props} backend={backend} session={gameBootstrap.session} projector={gameProjector} />
  )
}
