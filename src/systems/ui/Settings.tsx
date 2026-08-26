/* oxlint-disable react/only-export-components -- 감도 기본값·범위 상수를 컨트롤러 연결 시 같이 쓴다(Atmosphere.tsx 관례). */
import { useState } from 'react'
import { useRuntime, type QualityPreset } from '../../store/useRuntime'

/**
 * M4-05 — 설정: low/base 프리셋 · 마우스 감도 · 재시작. 이 셋만 제공한다(로드맵).
 *
 * - 프리셋: `useRuntime.preset` 을 그대로 쓴다(스토어 파일은 수정하지 않는다). 계획서 §3-6 값은
 *   `quality-presets.json` 이 단일 원본이고 소비자(Foliage·Atmosphere 등)가 이미 preset 키로 읽는다.
 * - 감도: 스토어에 필드가 없어 **컴포넌트 로컬 메모리**에만 둔다. localStorage 등 영속 금지 —
 *   로드맵 완료 조건 "새로고침 시 low 복원" 은 아무것도 저장하지 않는 것으로 만족한다(main.tsx 가 `?q` 만 읽는다).
 *   ※ 컨트롤러(Controller.tsx)의 yaw 계수 0.005 는 아직 상수라, 마운트 시 `onSensitivityChange` 로 넘겨 연결한다.
 * - 재시작: `location.reload()`.
 *
 * 아직 마운트하지 않는다 — R29 에서 App.tsx 의 `<RuntimeHud />` 옆에 붙인다.
 */
export const DEFAULT_MOUSE_SENSITIVITY = 1.0
export const SENSITIVITY_RANGE = { min: 0.25, max: 3, step: 0.25 } as const

export interface SettingsProps {
  /** 감도(배율) 변경 콜백. 컨트롤러 연결 전까지는 선택. */
  onSensitivityChange?: (multiplier: number) => void
  /** 테스트·스모크에서 reload 를 막기 위한 주입 지점 */
  restart?: () => void
}

export function Settings({ onSensitivityChange, restart = () => location.reload() }: SettingsProps) {
  const preset = useRuntime((s) => s.preset)
  const set = useRuntime((s) => s.set)
  const [open, setOpen] = useState(false)
  const [sensitivity, setSensitivity] = useState(DEFAULT_MOUSE_SENSITIVITY)

  const panel: React.CSSProperties = {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: '8px 10px',
    font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    color: '#e8eef4',
    background: 'rgba(20, 24, 28, 0.72)',
    border: '1px solid rgba(232, 238, 244, 0.18)',
    borderRadius: 6,
  }

  return (
    <div data-testid="settings" style={panel}>
      <button
        type="button"
        data-testid="settings-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ font: 'inherit', cursor: 'pointer', background: 'transparent', color: 'inherit', border: 0, padding: 0 }}
      >
        설정 {open ? '▴' : '▾'}
      </button>
      {open ? (
        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
          <label>
            품질{' '}
            <select
              data-testid="settings-preset"
              value={preset}
              onChange={(e) => set({ preset: e.target.value as QualityPreset })}
              style={{ font: 'inherit' }}
            >
              <option value="low">low (낮음)</option>
              <option value="base">base (기본)</option>
            </select>
          </label>
          <label>
            마우스 감도 <b style={{ color: '#ffd9a0' }}>{sensitivity.toFixed(2)}×</b>
            <input
              data-testid="settings-sensitivity"
              type="range"
              min={SENSITIVITY_RANGE.min}
              max={SENSITIVITY_RANGE.max}
              step={SENSITIVITY_RANGE.step}
              value={sensitivity}
              onChange={(e) => {
                const v = Number(e.target.value)
                setSensitivity(v)
                onSensitivityChange?.(v)
              }}
              style={{ display: 'block', width: 160 }}
            />
          </label>
          <button
            type="button"
            data-testid="settings-restart"
            onClick={restart}
            style={{ font: 'inherit', cursor: 'pointer', padding: '4px 10px' }}
          >
            재시작
          </button>
        </div>
      ) : null}
    </div>
  )
}
