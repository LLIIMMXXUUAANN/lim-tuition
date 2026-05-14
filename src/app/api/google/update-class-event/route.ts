import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { findRecurringEventIds, updateWeeklyClassEvents } from '@/lib/google/calendar'
import { updateStudentMeetDoc } from '@/lib/google/drive'
import type { ClassSlot } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    name?: string
    class_schedule?: { day: string; start: string; end: string }[]
    event_ids?: string[]
    meet_link?: string
    drive_folder_url?: string
  }
  const { name, class_schedule, event_ids, meet_link, drive_folder_url } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!class_schedule?.length) return NextResponse.json({ error: 'class_schedule is required and must not be empty' }, { status: 400 })
  if (!event_ids?.length) return NextResponse.json({ error: 'event_ids is required and must not be empty' }, { status: 400 })
  if (!meet_link?.trim()) return NextResponse.json({ error: 'meet_link is required' }, { status: 400 })
  const invalidSlot = class_schedule.find(s => !s.day || !s.start || !s.end)
  if (invalidSlot) return NextResponse.json({ error: 'Each class_schedule slot must have day, start, and end' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const trimmedName = name.trim()
    const trimmedMeetLink = meet_link.trim()
    const slots = class_schedule as ClassSlot[]

    const trimmedDriveUrl = drive_folder_url?.trim()
    const [searchResult, driveResult] = await Promise.allSettled([
      findRecurringEventIds(auth, trimmedName),
      trimmedDriveUrl
        ? updateStudentMeetDoc(auth, trimmedDriveUrl, trimmedName, slots, trimmedMeetLink)
        : Promise.resolve(null),
    ])
    const searchIds = searchResult.status === 'fulfilled' ? searchResult.value : []
    const mergedEventIds = [...new Set([...event_ids, ...searchIds])]

    const calendarResult = await Promise.allSettled([
      updateWeeklyClassEvents(auth, trimmedName, slots, mergedEventIds, trimmedMeetLink),
    ]).then(([r]) => r)

    if (calendarResult.status === 'rejected') {
      const raw = calendarResult.reason instanceof Error ? calendarResult.reason.message : 'Failed to update calendar events'
      const message = raw.includes('invalid_grant')
        ? 'Google auth expired. Visit /api/google/auth to reconnect.'
        : raw.toLowerCase().includes('insufficient') || raw.includes('403')
        ? 'Google Calendar not authorised. Visit /api/google/auth to re-connect with Calendar access.'
        : raw
      return NextResponse.json({ error: message }, { status: 500 })
    }

    let driveDocError = driveResult.status === 'rejected'
      ? (driveResult.reason instanceof Error ? driveResult.reason.message : 'Failed to update Drive doc')
      : null

    const newMeetLink = calendarResult.value.meetLink
    if (newMeetLink && trimmedDriveUrl) {
      try {
        await updateStudentMeetDoc(auth, trimmedDriveUrl, trimmedName, slots, newMeetLink)
        driveDocError = null
      } catch (err: unknown) {
        driveDocError = err instanceof Error ? err.message : 'Failed to update Drive doc with new Meet link'
      }
    }

    return NextResponse.json({ eventIds: calendarResult.value.eventIds, meetLink: newMeetLink, driveDocError })
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to update calendar events'
    return NextResponse.json({ error: raw }, { status: 500 })
  }
}
