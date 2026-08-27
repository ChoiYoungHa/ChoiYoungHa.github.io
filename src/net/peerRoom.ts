import Peer, { type DataConnection } from 'peerjs'
import {
  createRemotePlayer,
  hostPeerId,
  isNetMessage,
  isStale,
  MAX_REMOTE_PLAYERS,
  PROTOCOL_VERSION,
  pushSample,
  type NetMessage,
  type PlayerIdentity,
  type PlayerPose,
  type RemotePlayer,
} from './protocol'

/**
 * 2026-08-28 (master) — PeerJS 방. 서버 없이 동작한다: 방 id → host peer id 가 결정적이라 **먼저 그 id 를 등록한 쪽이 host**,
 * 실패(`unavailable-id`)하면 임의 id 로 만들고 host 에 접속한다. host 가 나가면 클라이언트는 잠시 뒤 host id 를 다시 노린다(재선출).
 *
 * host 역할: 각 클라이언트 상태를 받아 다른 모두에게 중계 + 자기 상태 송신 + 입장/퇴장 통지.
 * 클라이언트 역할: host 에게만 보낸다.
 */

export type RoomStatus = 'idle' | 'connecting' | 'host' | 'client' | 'error'

export interface RoomSnapshot {
  status: RoomStatus
  selfId: string | null
  room: string
  /** 자기 제외 접속자 수. */
  peerCount: number
  error: string | null
}

type Listener = () => void

export class PeerRoom {
  readonly room: string
  private peer: Peer | null = null
  private role: 'host' | 'client' | null = null
  private hostConn: DataConnection | null = null
  private clients = new Map<string, DataConnection>()
  private remotes = new Map<string, RemotePlayer>()
  private listeners = new Set<Listener>()
  private snapshot: RoomSnapshot
  private who: PlayerIdentity
  private closed = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private now: () => number

  constructor(room: string, who: PlayerIdentity, now: () => number = () => Date.now()) {
    this.room = room
    this.who = who
    this.now = now
    this.snapshot = { status: 'idle', selfId: null, room, peerCount: 0, error: null }
  }

  getSnapshot = (): RoomSnapshot => this.snapshot
  subscribe = (listener: Listener): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getRemotes(): ReadonlyMap<string, RemotePlayer> { return this.remotes }

  private emit(patch: Partial<RoomSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, peerCount: this.remotes.size }
    for (const listener of this.listeners) listener()
  }

  start(): void {
    if (this.closed) return
    this.emit({ status: 'connecting', error: null })
    this.tryHost()
  }

  setIdentity(who: PlayerIdentity): void { this.who = who }

  /** 호스트 id 선점 시도. 실패하면 클라이언트로. */
  private tryHost(): void {
    const peer = new Peer(hostPeerId(this.room), { debug: 0 })
    this.peer = peer
    peer.on('open', (id) => {
      if (this.closed) { peer.destroy(); return }
      this.role = 'host'
      this.emit({ status: 'host', selfId: id })
    })
    peer.on('connection', (conn) => this.acceptClient(conn))
    peer.on('error', (err: Error & { type?: string }) => {
      if (err.type === 'unavailable-id') { peer.destroy(); this.peer = null; this.joinAsClient(); return }
      if (err.type === 'peer-unavailable') return
      this.emit({ status: 'error', error: `${err.type ?? 'error'}: ${err.message}` })
      this.scheduleRetry()
    })
    peer.on('disconnected', () => { if (!this.closed && !peer.destroyed && this.peer === peer) peer.reconnect() })
  }

  private joinAsClient(): void {
    const peer = new Peer({ debug: 0 })
    this.peer = peer
    peer.on('open', (id) => {
      if (this.closed) { peer.destroy(); return }
      this.role = 'client'
      this.emit({ selfId: id })
      const conn = peer.connect(hostPeerId(this.room), { reliable: false, serialization: 'json' })
      this.hostConn = conn
      conn.on('open', () => {
        this.emit({ status: 'client' })
        conn.send({ t: 'hello', v: PROTOCOL_VERSION, id, who: this.who } satisfies NetMessage)
      })
      conn.on('data', (data) => this.onMessage(data, conn))
      conn.on('close', () => this.onHostLost())
      conn.on('error', () => this.onHostLost())
    })
    peer.on('error', (err: Error & { type?: string }) => {
      if (err.type === 'peer-unavailable') { this.onHostLost(); return }
      this.emit({ status: 'error', error: `${err.type ?? 'error'}: ${err.message}` })
      this.scheduleRetry()
    })
  }

  /** host 소실: 원격 전부 비우고 잠시 뒤 host 재선점을 시도한다(모든 클라이언트가 동시에 노려도 브로커가 하나만 받는다). */
  private onHostLost(): void {
    if (this.closed) return
    this.hostConn = null
    this.remotes.clear()
    this.emit({ status: 'connecting', error: null })
    this.scheduleRetry()
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer !== null) return
    const delay = 500 + Math.random() * 1500
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.peer?.destroy()
      this.peer = null
      this.role = null
      this.clients.clear()
      this.tryHost()
    }, delay)
  }

  private acceptClient(conn: DataConnection): void {
    conn.on('open', () => {
      if (this.clients.size >= MAX_REMOTE_PLAYERS) { conn.close(); return }
      this.clients.set(conn.peer, conn)
      conn.send({
        t: 'welcome', v: PROTOCOL_VERSION, hostId: this.peer?.id ?? '',
        peers: [...this.remotes.values()].map((r) => ({ id: r.id, who: r.who })),
      } satisfies NetMessage)
    })
    conn.on('data', (data) => this.onMessage(data, conn))
    const drop = () => {
      this.clients.delete(conn.peer)
      if (this.remotes.delete(conn.peer)) {
        this.broadcast({ t: 'bye', id: conn.peer }, conn.peer)
        this.emit({})
      }
    }
    conn.on('close', drop)
    conn.on('error', drop)
  }

  private onMessage(data: unknown, from: DataConnection): void {
    if (!isNetMessage(data)) return
    const now = this.now()
    switch (data.t) {
      case 'hello': {
        if (data.id !== from.peer) return
        this.remotes.set(data.id, createRemotePlayer(data.id, data.who, now))
        if (this.role === 'host') this.broadcast({ t: 'state', id: data.id, who: data.who, pose: { x: 0, y: -999, z: 0, rotY: 0, speed: 0, grounded: true, attackSeq: 0, skillSeq: 0 } }, data.id)
        this.emit({})
        return
      }
      case 'welcome': {
        for (const p of data.peers) if (!this.remotes.has(p.id)) this.remotes.set(p.id, createRemotePlayer(p.id, p.who, now))
        if (!this.remotes.has(data.hostId) && data.hostId) this.remotes.set(data.hostId, createRemotePlayer(data.hostId, { name: '…', jobId: 'warrior', weapon: null }, now))
        this.emit({})
        return
      }
      case 'state': {
        if (this.role === 'host' && data.id !== from.peer) return // 클라이언트는 자기 상태만 보낼 수 있다
        let remote = this.remotes.get(data.id)
        if (remote === undefined) {
          if (this.remotes.size >= MAX_REMOTE_PLAYERS) return
          remote = createRemotePlayer(data.id, data.who ?? { name: '…', jobId: 'warrior', weapon: null }, now)
          this.remotes.set(data.id, remote)
          this.emit({})
        }
        if (data.who !== undefined) remote.who = data.who
        if (data.pose.y > -900) pushSample(remote, data.pose, now)
        if (this.role === 'host') this.broadcast(data, data.id)
        return
      }
      case 'bye': {
        if (this.remotes.delete(data.id)) this.emit({})
        if (this.role === 'host') this.broadcast(data, from.peer)
        return
      }
    }
  }

  private broadcast(message: NetMessage, exceptId?: string): void {
    for (const [id, conn] of this.clients) {
      if (id === exceptId || !conn.open) continue
      try { conn.send(message) } catch { /* 끊긴 연결은 close 에서 정리 */ }
    }
  }

  /** 자기 상태 송신(10Hz). who 는 매번 실어 늦게 들어온 쪽도 이름·무기를 안다(작은 페이로드). */
  sendPose(pose: PlayerPose): void {
    const id = this.peer?.id
    if (!id) return
    const message: NetMessage = { t: 'state', id, pose, who: this.who }
    if (this.role === 'host') this.broadcast(message)
    else if (this.hostConn?.open) this.hostConn.send(message)
    // 오래 소식 없는 원격은 정리
    const now = this.now()
    let changed = false
    for (const [rid, remote] of this.remotes) if (isStale(remote, now)) { this.remotes.delete(rid); changed = true }
    if (changed) this.emit({})
  }

  close(): void {
    this.closed = true
    if (this.retryTimer !== null) clearTimeout(this.retryTimer)
    const id = this.peer?.id
    if (id) {
      const bye: NetMessage = { t: 'bye', id }
      if (this.role === 'host') this.broadcast(bye)
      else if (this.hostConn?.open) { try { this.hostConn.send(bye) } catch { /* ignore */ } }
    }
    this.peer?.destroy()
    this.peer = null
    this.remotes.clear()
    this.emit({ status: 'idle' })
  }
}
