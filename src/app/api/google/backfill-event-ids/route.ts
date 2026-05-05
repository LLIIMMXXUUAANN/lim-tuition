import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { google } from 'googleapis'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) return NextResponse.json({ error: 'GOOGLE_CALENDAR_ID not set' }, { status: 500 })

  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select('id, name, google_meet_link')
    .not('google_meet_link', 'is', null)
    .is('calendar_event_ids', null)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!students?.length) return NextResponse.json({ message: 'All students already have event IDs — nothing to backfill.', updated: 0 })

  const auth = await getOAuth2Client()
  const calendar = google.calendar({ version: 'v3', auth })

  const results: { name: string; found: number; status: string }[] = []

  for (const student of students) {
    try {
      const res = await calendar.events.list({
        calendarId,
        q: student.name,
        singleEvents: false,
        maxResults: 20,
      })

      // Only exact-name recurring events (the master series, not instances)
      const matching = (res.data.items ?? []).filter(
        e => e.summary === student.name && e.recurrence?.length && e.id,
      )
      // Sort by creation time so slot 0 (the one with Meet conference) comes first
      matching.sort((a, b) => new Date(a.created!).getTime() - new Date(b.created!).getTime())
      const eventIds = matching.map(e => e.id!)

      if (eventIds.length === 0) {
        results.push({ name: student.name, found: 0, status: 'no matching events found — skipped' })
        continue
      }

      const { error: updateErr } = await supabase
        .from('students')
        .update({ calendar_event_ids: eventIds })
        .eq('id', student.id)

      results.push({
        name: student.name,
        found: eventIds.length,
        status: updateErr ? `DB error: ${updateErr.message}` : 'updated',
      })
    } catch (err: unknown) {
      results.push({
        name: student.name,
        found: 0,
        status: `error: ${err instanceof Error ? err.message : 'unknown'}`,
      })
    }
  }

  const updated = results.filter(r => r.status === 'updated').length
  return NextResponse.json({
    message: `Backfilled ${updated} of ${students.length} students.`,
    results,
  })
}
