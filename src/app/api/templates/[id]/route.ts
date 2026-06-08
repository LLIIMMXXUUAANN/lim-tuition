import { NextRequest } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireTutor()
  if (error) return error

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const res = await fetch(`${FASTAPI}/templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': SECRET },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return Response.json(data, { status: res.status })
}
