import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const upstream = await fetch(`${FASTAPI}/agent/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify(body),
  })
  return NextResponse.json(await upstream.json(), { status: upstream.status })
}
