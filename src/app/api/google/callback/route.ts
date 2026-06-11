import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  const base = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
  const res = await fetch(`${base}/google/callback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Secret': process.env.INTERNAL_API_SECRET ?? '',
    },
    body: JSON.stringify({ code, state }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: (err as { detail?: string }).detail ?? 'OAuth failed' }, { status: res.status })
  }

  return NextResponse.json({ ok: true, message: 'Google connected successfully. You can close this tab.' })
}
