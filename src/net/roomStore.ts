import { useSyncExternalStore } from 'react'
import { PeerRoom, type RoomSnapshot } from './peerRoom'
import { roomIdFromSearch, sanitizeName, type PlayerIdentity } from './protocol'

/**
 * 2026-08-28 (master) — 방 싱글턴. 게임 씬에 들어갈 때 ensureRoom(), 페이지 이탈 시 close.
 * `?net=0` 이면 끄기(헤드리스 프로브·벤치가 브로커에 붙지 않도록). 기본은 켬.
 */

let room: PeerRoom | null = null
const IDLE: RoomSnapshot = { status: 'idle', selfId: null, room: '', peerCount: 0, error: null }
const listeners = new Set<() => void>()

export function isNetEnabled(search: string = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search).get('net') !== '0'
}

export function ensureRoom(who: PlayerIdentity): PeerRoom | null {
  if (!isNetEnabled()) return null
  if (room !== null) { room.setIdentity({ ...who, name: sanitizeName(who.name) }); return room }
  room = new PeerRoom(roomIdFromSearch(location.search), { ...who, name: sanitizeName(who.name) })
  room.subscribe(() => { for (const l of listeners) l() })
  room.start()
  for (const l of listeners) l()
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { room?.close() }, { once: true })
  return room
}

export function getRoom(): PeerRoom | null { return room }

export function useRoomSnapshot(): RoomSnapshot {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    () => room?.getSnapshot() ?? IDLE,
    () => IDLE,
  )
}
