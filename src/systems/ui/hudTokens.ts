export const HUD_TOKENS = {
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  layout: {
    stats: { left: '50%', bottom: 16, width: 320, height: 104 }, // 2026-08-27 영하님: 하단 중앙
    portrait: { bottom: 16, size: 72 },
    quest: { right: 16, top: 16, width: 220, height: 64 },
    quick: { left: 16, bottom: 16 },
    meso: { right: 16, bottom: 16 },
    quickSlotSize: 52,
  },
  colors: {
    panel: 'rgba(18,20,26,0.78)',
    panelStrong: 'rgba(12,14,19,0.9)',
    border: 'rgba(214,178,102,0.55)',
    text: '#f5f0e4',
    muted: '#b9b3a6',
    hp: '#d94a4a',
    mp: '#4a8fd9',
    exp: '#c9a94a',
    cooldown: 'rgba(5,7,11,0.76)',
  },
  borderImage: {
    panel: {
      borderImageSource: 'url("/ui/frame/panel-frame.png")',
      borderImageSlice: 24,
      borderImageWidth: '10px',
      borderImageOutset: '4px',
      borderImageRepeat: 'stretch',
    },
    button: {
      borderImageSource: 'url("/ui/frame/button-frame.png")',
      borderImageSlice: 24,
      borderImageWidth: '8px',
      borderImageOutset: '3px',
      borderImageRepeat: 'stretch',
    },
  },
} as const
