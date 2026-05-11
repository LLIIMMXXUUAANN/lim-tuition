import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { syncAllStudents } from '@/lib/google/sync'

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export async function POST() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  let auth: Awaited<ReturnType<typeof getOAuth2Client>>
  try {
    auth = await getOAuth2Client()
  } catch (err: unknown) {
    return NextResponse.json({ error: errMsg(err, 'Google auth failed') }, { status: 500 })
  }

  try {
    const results = await syncAllStudents(supabase, auth)
    return NextResponse.json({ results })
  } catch (err: unknown) {
    return NextResponse.json({ error: errMsg(err, 'Sync failed') }, { status: 500 })
  }
}
