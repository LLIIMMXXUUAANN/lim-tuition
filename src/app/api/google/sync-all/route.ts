import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const upstream = await fetch(`${FASTAPI}/google/sync-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify({}),
  })
  const data = await upstream.json()
  return NextResponse.json(data, { status: upstream.status })
}
