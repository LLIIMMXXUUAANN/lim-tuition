const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function fetchFastAPI(path: string, init?: RequestInit) {
  return fetch(`${FASTAPI}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': SECRET,
      ...(init?.headers ?? {}),
    },
  })
}
