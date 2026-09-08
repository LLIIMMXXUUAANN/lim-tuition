export class HttpError extends Error {
  status: number
  retryAfterMs?: number

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message)
    this.status = status
    this.retryAfterMs = retryAfterMs
  }
}

// Only infrastructure-layer failures — a bare 500 is deliberately excluded:
// this backend funnels many kinds of unexpected exceptions into 500, but a
// 500 can also mean a real, permanent application bug, so it isn't assumed
// safe to blindly retry by default.
const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504])
const MAX_RETRIES = 2
const BASE_DELAY_MS = 300
const MAX_DELAY_MS = 5000

export function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  if (failureCount > MAX_RETRIES) return false
  if (error instanceof HttpError) return RETRYABLE_STATUS_CODES.has(error.status)
  return true // network errors (fetch threw, not an HttpError) — always worth retrying
}

// AWS "Full Jitter": random_between(0, min(cap, base * 2^attempt))
function backoffDelay(attempt: number): number {
  const exponential = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
  return Math.random() * exponential
}

// Prefers the server's own Retry-After value (RFC 7231) when the mutationFn
// captured one, falling back to our own backoff schedule otherwise.
export function mutationRetryDelay(attempt: number, error: unknown): number {
  if (error instanceof HttpError && error.retryAfterMs !== undefined) {
    return error.retryAfterMs
  }
  return backoffDelay(attempt)
}

// Reads a Retry-After response header (seconds or an HTTP-date, per RFC 7231)
// and returns milliseconds to wait, or undefined if absent/unparseable.
// Call this at the point of throwing HttpError, since retry callbacks only
// receive the thrown error, not the original Response.
export function parseRetryAfterMs(res: Response): number | undefined {
  const header = res.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  if (!Number.isNaN(seconds)) return seconds * 1000
  const dateMs = Date.parse(header)
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now())
  return undefined
}
