import { NextResponse } from 'next/server'

export async function GET() {
  const base = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
  const res = await fetch(`${base}/google/auth-url`, {
    headers: { 'X-Internal-Secret': process.env.INTERNAL_API_SECRET ?? '' },
  })
  if (!res.ok) return NextResponse.json({ error: 'Failed to start OAuth' }, { status: 500 })
  const { url } = await res.json()
  return NextResponse.redirect(url)
}
