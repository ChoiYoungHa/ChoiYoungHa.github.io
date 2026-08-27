import { useRoomSnapshot } from './roomStore'

/** 2026-08-28 — 접속 상태 배지(우상단 설정 아래). 클릭 없음, 정보만. */
export function NetStatus() {
  const snap = useRoomSnapshot()
  if (snap.status === 'idle') return null
  const label = snap.status === 'connecting' ? '접속 중…'
    : snap.status === 'error' ? `오프라인(${snap.error ?? 'error'})`
    : `온라인 · 방 ${snap.room} · ${snap.peerCount + 1}명${snap.status === 'host' ? ' (호스트)' : ''}`
  const color = snap.status === 'host' || snap.status === 'client' ? '#7ee08a' : snap.status === 'error' ? '#ff8a8a' : '#ffd27a'
  return (
    <div aria-label="접속 상태" data-net-status={snap.status} style={{ position: 'absolute', top: 52, right: 12, padding: '4px 10px', borderRadius: 8, background: 'rgba(12,14,18,0.72)', color, fontSize: 12, fontFamily: 'inherit', pointerEvents: 'none', zIndex: 5, letterSpacing: 0.2 }}>
      ● {label}
    </div>
  )
}
