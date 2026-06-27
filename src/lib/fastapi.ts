import { camelizeKeys } from '@/lib/utils'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function fetchFastAPI(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${FASTAPI}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': SECRET,
      ...(init?.headers ?? {}),
    },
  })
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json') && res.body) {
    return new Response(JSON.stringify(camelizeKeys(await res.json())), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
  return res
}
