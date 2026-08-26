export interface InteractPromptProps {
  interactableId: string | null
}

export function InteractPrompt({ interactableId }: InteractPromptProps) {
  if (interactableId === null) return null
  return (
    <div
      data-interact-prompt={interactableId}
      role="status"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 118,
        transform: 'translateX(-50%)',
        padding: '8px 14px',
        border: '1px solid rgba(255, 222, 140, 0.8)',
        borderRadius: 8,
        background: 'rgba(18, 20, 24, 0.82)',
        color: '#fff4cc',
        fontWeight: 700,
        textShadow: '0 1px 2px #000',
      }}
    >
      <span>F 대화</span>
    </div>
  )
}
