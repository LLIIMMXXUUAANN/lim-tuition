import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'
import { newOAuth2Client } from '@/services/google/auth'

export async function GET(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 })

  const client = newOAuth2Client()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    return NextResponse.json({ error: 'No refresh token returned. Revoke app access in Google Account settings and try again.' }, { status: 400 })
  }

  await supabase.from('settings').upsert({ key: 'google_refresh_token', value: tokens.refresh_token })

  return NextResponse.json({ ok: true, message: 'Google Drive connected successfully. You can close this tab.' })
}
