import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { updateWeeklyClassEvents } from '@/lib/google/calendar'
import type { ClassSlot } from '@/lib/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    name?: string
    class_schedule?: { day: string; start: string; end: string }[]
    event_ids?: string[]
    meet_link?: string
  }
  const { name, class_schedule, event_ids, meet_link } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!class_schedule?.length) return NextResponse.json({ error: 'class_schedule is required and must not be empty' }, { status: 400 })
  if (!event_ids?.length) return NextResponse.json({ error: 'event_ids is required and must not be empty' }, { status: 400 })
  if (!meet_link?.trim()) return NextResponse.json({ error: 'meet_link is required' }, { status: 400 })
  const invalidSlot = class_schedule.find(s => !s.day || !s.start || !s.end)
  if (invalidSlot) return NextResponse.json({ error: 'Each class_schedule slot must have day, start, and end' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const { eventIds } = await updateWeeklyClassEvents(
      auth,
      name.trim(),
      class_schedule as ClassSlot[],
      event_ids,
      meet_link.trim(),
    )
    return NextResponse.json({ eventIds })
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to update calendar events'
    const message = raw.toLowerCase().includes('insufficient') || raw.includes('403')
      ? 'Google Calendar not authorised. Visit /api/google/auth to re-connect with Calendar access.'
      : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
