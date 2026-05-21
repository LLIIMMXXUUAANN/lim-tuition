export const stopSignals = new Map<string, boolean>()
export const requestAbortControllers = new Map<string, AbortController>()

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError'
}
