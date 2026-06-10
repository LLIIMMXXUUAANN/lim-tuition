import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  let upstream: Response
  try {
    upstream = await fetch(`${FASTAPI}/google/create-student-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
      body: JSON.stringify(body),
    })
  } catch (err) {
    return NextResponse.json({ detail: `FastAPI unreachable: ${err}` }, { status: 502 })
  }
  const data = await upstream.json().catch(() => ({ detail: 'FastAPI returned empty response' }))
  return NextResponse.json(data, { status: upstream.status })
}
