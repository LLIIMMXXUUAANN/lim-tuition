import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const upstream = await fetch(`${FASTAPI}/google/create-class-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify(body),
  })
  const data = await upstream.json()
  if (!upstream.ok) return NextResponse.json(data, { status: upstream.status })
  return NextResponse.json(
    { meetLink: data.meet_link, eventCount: data.event_count, eventIds: data.event_ids },
    { status: upstream.status },
  )
}
