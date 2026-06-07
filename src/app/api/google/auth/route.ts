import { NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'
import { newOAuth2Client } from '@/services/google/auth'

export async function GET() {
  const { error } = await requireTutor()
  if (error) return error

  const client = newOAuth2Client()
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar',
    ],
  })
  return NextResponse.redirect(url)
}
