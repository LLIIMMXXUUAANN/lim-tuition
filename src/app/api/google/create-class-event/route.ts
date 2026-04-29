import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { createWeeklyClassEvents } from '@/lib/google/calendar'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { name?: string; class_schedule?: { day: string; start: string; end: string }[] }
  const { name, class_schedule } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!class_schedule?.length) return NextResponse.json({ error: 'class_schedule is required and must not be empty' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const { meetLink, eventCount } = await createWeeklyClassEvents(auth, name.trim(), class_schedule)
    return NextResponse.json({ meetLink, eventCount })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create calendar event'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
