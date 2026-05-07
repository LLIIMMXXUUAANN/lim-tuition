import { NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { google } from 'googleapis'

export async function GET() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) return NextResponse.json({ error: 'GOOGLE_CALENDAR_ID not set' }, { status: 500 })

  const { data: students, error: fetchErr } = await supabase
    .from('students')
    .select('id, name, google_meet_link')
    .not('google_meet_link', 'is', null)
    .is('calendar_event_ids', null)
    .eq('status', 'Active')

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!students?.length) return NextResponse.json({ message: 'All students already have event IDs — nothing to backfill.', updated: 0 })

  const auth = await getOAuth2Client()
  const calendar = google.calendar({ version: 'v3', auth })

  const searches = await Promise.all(
    students.map(async (student) => {
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
        return { student, eventIds: matching.map(e => e.id!), error: null }
      } catch (err: unknown) {
        return { student, eventIds: [] as string[], error: err instanceof Error ? err.message : 'unknown' }
      }
    })
  )

  const results = await Promise.all(
    searches.map(async ({ student, eventIds, error }) => {
      if (error) return { name: student.name, found: 0, status: `error: ${error}` }
      if (eventIds.length === 0) return { name: student.name, found: 0, status: 'no matching events found — skipped' }
      const { error: updateErr } = await supabase
        .from('students')
        .update({ calendar_event_ids: eventIds })
        .eq('id', student.id)
      return {
        name: student.name,
        found: eventIds.length,
        status: updateErr ? `DB error: ${updateErr.message}` : 'updated',
      }
    })
  )

  const updated = results.filter(r => r.status === 'updated').length
  return NextResponse.json({
    message: `Backfilled ${updated} of ${students.length} students.`,
    results,
  })
}
