import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 })

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) {
    return NextResponse.json({ error: 'No refresh token returned. Revoke app access in Google Account settings and try again.' }, { status: 400 })
  }

  const supabase = await createClient()
  await supabase.from('settings').upsert({ key: 'google_refresh_token', value: tokens.refresh_token })

  return NextResponse.json({ ok: true, message: 'Google Drive connected successfully. You can close this tab.' })
}
