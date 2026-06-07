import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'
import { getOAuth2Client } from '@/services/google/auth'
import { createWeeklyClassEvents } from '@/services/google/calendar'
import type { ClassSlot } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { name?: string; class_schedule?: { day: string; start: string; end: string }[] }
  const { name, class_schedule } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!class_schedule?.length) return NextResponse.json({ error: 'class_schedule is required and must not be empty' }, { status: 400 })
  const invalidSlot = class_schedule.find(s => !s.day || !s.start || !s.end)
  if (invalidSlot) return NextResponse.json({ error: 'Each class_schedule slot must have day, start, and end' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const { meetLink, eventCount, eventIds } = await createWeeklyClassEvents(auth, name.trim(), class_schedule as ClassSlot[])
    return NextResponse.json({ meetLink, eventCount, eventIds })
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to create calendar event'
    const message = raw.toLowerCase().includes('insufficient') || raw.includes('403')
      ? 'Google Calendar not authorised. Visit /api/google/auth to re-connect with Calendar access.'
      : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
