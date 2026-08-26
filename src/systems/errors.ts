export interface RuntimeIssue {
  type: 'error' | 'unhandledrejection' | 'webglcontextlost'
  message: string
  at: number
  intentional?: boolean
}

export interface ErrorSnapshot {
  issues: RuntimeIssue[]
  errorCount: number
  unhandledRejectionCount: number
  webglContextLostCount: number
  tdrCount: number
  intentionalRejectionCount: number
}

export function startErrorCollector() {
  const issues: RuntimeIssue[] = []
  const onError = (event: ErrorEvent) => {
    issues.push({ type: 'error', message: event.message, at: performance.now() })
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason)
    issues.push({
      type: 'unhandledrejection',
      message,
      at: performance.now(),
      intentional: message === 'm0b-intentional-rejection',
    })
  }
  const onContextLost = (event: Event) => {
    event.preventDefault()
    issues.push({ type: 'webglcontextlost', message: 'WebGL context lost / possible TDR', at: performance.now() })
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  document.addEventListener('webglcontextlost', onContextLost, true)

  return {
    snapshot(): ErrorSnapshot {
      return {
        issues: [...issues],
        errorCount: issues.filter((issue) => issue.type === 'error').length,
        unhandledRejectionCount: issues.filter((issue) => issue.type === 'unhandledrejection').length,
        webglContextLostCount: issues.filter((issue) => issue.type === 'webglcontextlost').length,
        tdrCount: issues.filter((issue) => issue.type === 'webglcontextlost').length,
        intentionalRejectionCount: issues.filter((issue) => issue.intentional).length,
      }
    },
    stop() {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
      document.removeEventListener('webglcontextlost', onContextLost, true)
    },
  }
}

export function triggerIntentionalRejection(): void {
  void Promise.reject(new Error('m0b-intentional-rejection'))
}
