import { NextRequest } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function GET(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return Response.json({ error: 'No code' }, { status: 400 })

  const res = await fetch(`${FASTAPI}/google/callback?code=${encodeURIComponent(code)}`, {
    headers: { 'X-Internal-Secret': SECRET },
  })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}
