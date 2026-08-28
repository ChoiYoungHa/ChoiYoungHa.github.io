import { useEffect, useState } from 'react'
import { HINT_VISIBLE_MS, hintHideDelayMs, hintVisibleAt } from './controlsHintLogic'

/**
 * M4-02 — 시작 안내(WASD·마우스)를 5초 보여주고 숨긴다.
 *
 * 규칙은 `controlsHintLogic.ts`(순수 함수)에 있고 여기는 타이머와 DOM 만 맡는다.
 * 5.1초 이후에는 요소가 언마운트되는 게 아니라 `hidden` 속성으로 남는다(완료 조건 "DOM hidden" 을 그대로 검증할 수 있게).
 *
 * 아직 마운트하지 않는다 — R29 에서 App.tsx 의 `<RuntimeHud />` 옆에 `<ControlsHint />` 로 붙인다.
 * 스타일은 App.css 를 건드리지 않기 위해 인라인이다(HUD 관례: 모노스페이스·반투명 다크 패널).
 */
export function ControlsHint({ visibleMs = HINT_VISIBLE_MS }: { visibleMs?: number }) {
  const [visible, setVisible] = useState(() => hintVisibleAt(0, visibleMs))

  useEffect(() => {
    const startedAt = performance.now()
    const timer = setTimeout(() => {
      setVisible(hintVisibleAt(performance.now() - startedAt, visibleMs))
    }, hintHideDelayMs(visibleMs))
    return () => clearTimeout(timer)
  }, [visibleMs])

  return (
    <div
      data-testid="controls-hint"
      hidden={!visible}
      aria-hidden={!visible}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 24,
        transform: 'translateX(-50%)',
        padding: '10px 16px',
        font: '14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        color: '#e8eef4',
        background: 'rgba(20, 24, 28, 0.72)',
        border: '1px solid rgba(232, 238, 244, 0.18)',
        borderRadius: 8,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <b style={{ color: '#ffd9a0' }}>W A S D</b> 이동 · <b style={{ color: '#ffd9a0' }}>Shift</b> 달리기 ·{' '}
      <b style={{ color: '#ffd9a0' }}>마우스 드래그</b> 시선 · <b style={{ color: '#ffd9a0' }}>I</b> 아이템 · <b style={{ color: '#ffd9a0' }}>C</b> 스탯
    </div>
  )
}
