import { NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function GET() {
  const { error } = await requireTutor()
  if (error) return error

  const res = await fetch(`${FASTAPI}/google/auth`, {
    headers: { 'X-Internal-Secret': SECRET },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return Response.json(data, { status: res.status })
  return NextResponse.redirect(data.url)
}
