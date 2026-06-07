import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { ClassSlot } from '@/lib/types'
import { DAY_INDEX, timeToMins } from '@/lib/utils'

const BYDAY: Record<string, string> = {
  Sunday: 'SU', Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE',
  Thursday: 'TH', Friday: 'FR', Saturday: 'SA',
}

const TIMEZONE = 'Asia/Kuala_Lumpur'

// Returns "YYYY-MM-DDTHH:MM:SS" with no Z suffix so Google Calendar treats it
// as local MYT time (via the timeZone field). Operates entirely in MYT to avoid
// UTC offset errors on servers where process timezone is UTC.
function nowInTimezone(tz: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const g = (t: string) => parts.find(p => p.type === t)!.value
  return new Date(`${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`)
}

function formatDateObj(d: Date): string {
  return (
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':00'
  )
}

// Returns start/end datetime strings for a class slot, anchored to the next
// occurrence of slot.day strictly after today. Starting from tomorrow removes
// all "has today's class time already passed?" logic.
// End is derived from start + duration so end > start is guaranteed.
function slotDateTimes(slot: ClassSlot): { start: string; end: string } {
  const nowMYT = nowInTimezone(TIMEZONE)
  const base = new Date(nowMYT)
  base.setDate(base.getDate() + 1)
  base.setHours(0, 0, 0, 0)
  const daysUntil = (DAY_INDEX[slot.day] - base.getDay() + 7) % 7
  base.setDate(base.getDate() + daysUntil)

  const [sh, sm] = slot.start.split(':').map(Number)
  const durationMins = (timeToMins(slot.end) - timeToMins(slot.start) + 24 * 60) % (24 * 60)

  const startDate = new Date(base)
  startDate.setHours(sh, sm, 0, 0)
  const endDate = new Date(startDate)
  endDate.setMinutes(endDate.getMinutes() + durationMins)

  return { start: formatDateObj(startDate), end: formatDateObj(endDate) }
}

export async function createWeeklyClassEvents(
  auth: OAuth2Client,
  studentName: string,
  schedule: ClassSlot[],
): Promise<{ meetLink: string; eventCount: number; eventIds: string[] }> {
  if (schedule.length === 0) throw new Error('Student has no class schedule.')

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')

  const calendar = google.calendar({ version: 'v3', auth })
  const eventIds: string[] = []

  const firstSlot = schedule[0]
  const firstByDay = BYDAY[firstSlot.day]
  if (!firstByDay) throw new Error(`Unknown day: ${firstSlot.day}`)
  const firstDT = slotDateTimes(firstSlot)

  const firstRes = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: studentName,
      start: { dateTime: firstDT.start, timeZone: TIMEZONE },
      end: { dateTime: firstDT.end, timeZone: TIMEZONE },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${firstByDay}`],
      conferenceData: {
        createRequest: {
          requestId: `${studentName}-${firstSlot.day}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  })

  const meetLink = firstRes.data.hangoutLink
  if (!meetLink) throw new Error('Calendar event created but no Meet link was returned.')
  if (!firstRes.data.id) throw new Error('Calendar event created but no event ID was returned.')
  eventIds.push(firstRes.data.id)

  const remainingIds = await Promise.all(
    schedule.slice(1).map(async (slot) => {
      const byDay = BYDAY[slot.day]
      if (!byDay) throw new Error(`Unknown day: ${slot.day}`)
      const dt = slotDateTimes(slot)
      const res = await calendar.events.insert({
        calendarId,
        conferenceDataVersion: 0,
        requestBody: {
          summary: studentName,
          description: `Google Meet link: ${meetLink}`,
          start: { dateTime: dt.start, timeZone: TIMEZONE },
          end: { dateTime: dt.end, timeZone: TIMEZONE },
          recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
        },
      })
      if (!res.data.id) throw new Error('Calendar event created but no event ID was returned.')
      return res.data.id
    })
  )
  eventIds.push(...remainingIds)

  return { meetLink, eventCount: schedule.length, eventIds }
}

export async function findRecurringEventIds(
  auth: OAuth2Client,
  studentName: string,
): Promise<string[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')

  const calendar = google.calendar({ version: 'v3', auth })

  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const res = await calendar.events.list({
    calendarId,
    q: studentName,
    singleEvents: true,
    timeMin,
    timeMax,
    maxResults: 200,
    orderBy: 'startTime',
  })

  const seriesIds = new Set<string>()
  for (const e of res.data.items ?? []) {
    if (e.summary === studentName && e.recurringEventId) {
      seriesIds.add(e.recurringEventId)
    }
  }

  return [...seriesIds]
}

export async function updateWeeklyClassEvents(
  auth: OAuth2Client,
  studentName: string,
  schedule: ClassSlot[],
  existingEventIds: string[],
  meetLink: string,
): Promise<{ eventIds: string[]; meetLink?: string }> {
  if (schedule.length === 0) throw new Error('Student has no class schedule.')

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')

  const calendar = google.calendar({ version: 'v3', auth })

  // Fetch all existing events to find the primary one (the event that owns the
  // Google Meet conference, identified by hangoutLink). We patch the primary
  // rather than deleting it so the Meet link is preserved. Everything else is
  // deleted and recreated fresh — no BYDAY-reading or duplicate-tracking needed.
  const eventDetails = await Promise.all(
    existingEventIds.map(id =>
      calendar.events.get({ calendarId, eventId: id }).catch(() => null)
    )
  )

  // Primary = the event that owns the Meet conference (hangoutLink present).
  // If none found (e.g. primary was manually deleted), treat as no-primary so the
  // else branch below creates a fresh event with conferenceData and a new Meet link.
  const primary = eventDetails.find(d => d?.data?.hangoutLink && d.data.id)

  const primaryId = primary?.data?.id ?? null
  const allExistingIds = eventDetails.map(d => d?.data?.id).filter(Boolean) as string[]

  const slot0 = schedule[0]
  const byDay0 = BYDAY[slot0.day]
  if (!byDay0) throw new Error(`Unknown day: ${slot0.day}`)
  const dt0 = slotDateTimes(slot0)

  let primaryResultId: string
  let newMeetLink: string | undefined
  if (primaryId) {
    const res = await calendar.events.patch({
      calendarId,
      eventId: primaryId,
      requestBody: {
        summary: studentName,
        start: { dateTime: dt0.start, timeZone: TIMEZONE },
        end: { dateTime: dt0.end, timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay0}`],
      },
    })
    primaryResultId = res.data.id ?? primaryId
  } else {
    const res = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: studentName,
        start: { dateTime: dt0.start, timeZone: TIMEZONE },
        end: { dateTime: dt0.end, timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay0}`],
        conferenceData: {
          createRequest: {
            requestId: `${studentName}-sync-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    })
    if (!res.data.id) throw new Error('Calendar event created but no event ID was returned.')
    primaryResultId = res.data.id
    newMeetLink = res.data.hangoutLink ?? undefined
  }

  const [, remainingIds] = await Promise.all([
    Promise.all(
      allExistingIds
        .filter(id => id !== primaryId)
        .map(eventId =>
          calendar.events.delete({ calendarId, eventId }).catch((err: unknown) => {
            // 410 Gone = already deleted — that's the desired outcome, not an error
            if ((err as { status?: number }).status !== 410) {
              console.error(`Failed to delete calendar event ${eventId}:`, err)
            }
          })
        )
    ),
    Promise.all(
      schedule.slice(1).map(async (slot) => {
        const byDay = BYDAY[slot.day]
        if (!byDay) throw new Error(`Unknown day: ${slot.day}`)
        const dt = slotDateTimes(slot)
        const res = await calendar.events.insert({
          calendarId,
          conferenceDataVersion: 0,
          requestBody: {
            summary: studentName,
            description: `Google Meet link: ${newMeetLink ?? meetLink}`,
            start: { dateTime: dt.start, timeZone: TIMEZONE },
            end: { dateTime: dt.end, timeZone: TIMEZONE },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
          },
        })
        if (!res.data.id) throw new Error('Calendar event created but no event ID was returned.')
        return res.data.id
      })
    ),
  ])

  return { eventIds: [primaryResultId, ...remainingIds], meetLink: newMeetLink }
}
