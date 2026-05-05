import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import type { ClassSlot } from '@/lib/types'

const BYDAY: Record<string, string> = {
  Sunday: 'SU', Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE',
  Thursday: 'TH', Friday: 'FR', Saturday: 'SA',
}

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
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

function nextOccurrenceDateTimeStr(day: string, time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const nowMYT = nowInTimezone(TIMEZONE)
  const result = new Date(nowMYT)
  result.setHours(hours, minutes, 0, 0)
  const daysUntil = (DAY_INDEX[day] - nowMYT.getDay() + 7) % 7
  if (daysUntil === 0 && result <= nowMYT) {
    result.setDate(result.getDate() + 7)
  } else {
    result.setDate(result.getDate() + daysUntil)
  }
  return (
    result.getFullYear() + '-' +
    String(result.getMonth() + 1).padStart(2, '0') + '-' +
    String(result.getDate()).padStart(2, '0') + 'T' +
    String(result.getHours()).padStart(2, '0') + ':' +
    String(result.getMinutes()).padStart(2, '0') + ':00'
  )
}

function nextEndDateTimeStr(day: string, startTime: string, endTime: string): string {
  const startStr = nextOccurrenceDateTimeStr(day, startTime)
  const endStr = nextOccurrenceDateTimeStr(day, endTime)
  if (endStr <= startStr) {
    // Class crosses midnight — add one day to end
    const [datePart, timePart] = endStr.split('T')
    const d = new Date(datePart)
    d.setDate(d.getDate() + 1)
    return (
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + 'T' + timePart
    )
  }
  return endStr
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

  // Create the first slot's event with a conference to generate one Meet link
  const firstSlot = schedule[0]
  const firstByDay = BYDAY[firstSlot.day]
  if (!firstByDay) throw new Error(`Unknown day: ${firstSlot.day}`)

  const firstRes = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: studentName,
      start: { dateTime: nextOccurrenceDateTimeStr(firstSlot.day, firstSlot.start), timeZone: TIMEZONE },
      end: { dateTime: nextEndDateTimeStr(firstSlot.day, firstSlot.start, firstSlot.end), timeZone: TIMEZONE },
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

  // Create remaining slots — reference the same Meet link in the description
  for (const slot of schedule.slice(1)) {
    const byDay = BYDAY[slot.day]
    if (!byDay) throw new Error(`Unknown day: ${slot.day}`)
    const res = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 0,
      requestBody: {
        summary: studentName,
        description: `Google Meet link: ${meetLink}`,
        start: { dateTime: nextOccurrenceDateTimeStr(slot.day, slot.start), timeZone: TIMEZONE },
        end: { dateTime: nextEndDateTimeStr(slot.day, slot.start, slot.end), timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
      },
    })
    if (!res.data.id) throw new Error('Calendar event created but no event ID was returned.')
    eventIds.push(res.data.id)
  }

  return { meetLink, eventCount: schedule.length, eventIds }
}

export async function updateWeeklyClassEvents(
  auth: OAuth2Client,
  studentName: string,
  schedule: ClassSlot[],
  existingEventIds: string[],
  meetLink: string,
): Promise<{ eventIds: string[] }> {
  if (schedule.length === 0) throw new Error('Student has no class schedule.')

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')

  const calendar = google.calendar({ version: 'v3', auth })

  // Positional match: existingEventIds[i] corresponds to schedule[i].
  // Index 0 always owns the Meet conference regardless of reordering — patching
  // only updates time/recurrence, conferenceData is untouched so Meet link is preserved.
  const updateOps = schedule.map((slot, i) => {
    const byDay = BYDAY[slot.day]
    if (!byDay) throw new Error(`Unknown day: ${slot.day}`)

    if (existingEventIds[i]) {
      return calendar.events.patch({
        calendarId,
        eventId: existingEventIds[i],
        requestBody: {
          summary: studentName,
          start: { dateTime: nextOccurrenceDateTimeStr(slot.day, slot.start), timeZone: TIMEZONE },
          end: { dateTime: nextEndDateTimeStr(slot.day, slot.start, slot.end), timeZone: TIMEZONE },
          recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
        },
      }).then(res => res.data.id ?? existingEventIds[i])
    }

    // New slot added — create without conference, reference existing Meet link
    return calendar.events.insert({
      calendarId,
      conferenceDataVersion: 0,
      requestBody: {
        summary: studentName,
        description: `Google Meet link: ${meetLink}`,
        start: { dateTime: nextOccurrenceDateTimeStr(slot.day, slot.start), timeZone: TIMEZONE },
        end: { dateTime: nextEndDateTimeStr(slot.day, slot.start, slot.end), timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
      },
    }).then(res => {
      if (!res.data.id) throw new Error('New calendar event created but no event ID was returned.')
      return res.data.id
    })
  })

  // Deletions are non-fatal — an orphaned recurring event is a minor annoyance, not a data correctness issue.
  const deleteOps = existingEventIds.slice(schedule.length).map(eventId =>
    calendar.events.delete({ calendarId, eventId }).catch((err: unknown) => {
      console.error(`Failed to delete calendar event ${eventId}:`, err)
    })
  )

  const [newEventIds] = await Promise.all([Promise.all(updateOps), Promise.all(deleteOps)])
  return { eventIds: newEventIds }
}
