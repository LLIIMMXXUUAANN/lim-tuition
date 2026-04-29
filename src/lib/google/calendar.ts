import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'

interface ClassSlot {
  day: string
  start: string
  end: string
}

const BYDAY: Record<string, string> = {
  Sunday: 'SU', Monday: 'MO', Tuesday: 'TU', Wednesday: 'WE',
  Thursday: 'TH', Friday: 'FR', Saturday: 'SA',
}

const TIMEZONE = 'Asia/Kuala_Lumpur'

function nextOccurrence(day: string, time: string): Date {
  const dayIndex: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  }
  const [hours, minutes] = time.split(':').map(Number)
  const now = new Date()
  const result = new Date(now)
  result.setHours(hours, minutes, 0, 0)
  const daysUntil = (dayIndex[day] - now.getDay() + 7) % 7
  if (daysUntil === 0 && result <= now) {
    result.setDate(result.getDate() + 7)
  } else {
    result.setDate(result.getDate() + daysUntil)
  }
  return result
}

export async function createWeeklyClassEvents(
  auth: OAuth2Client,
  studentName: string,
  schedule: ClassSlot[],
): Promise<{ meetLink: string; eventCount: number }> {
  if (schedule.length === 0) throw new Error('Student has no class schedule.')

  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')

  const calendar = google.calendar({ version: 'v3', auth })
  let firstMeetLink = ''

  for (const slot of schedule) {
    const byDay = BYDAY[slot.day]
    if (!byDay) throw new Error(`Unknown day: ${slot.day}`)

    const start = nextOccurrence(slot.day, slot.start)
    const end = nextOccurrence(slot.day, slot.end)

    const res = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: studentName,
        start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
        recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay}`],
        conferenceData: {
          createRequest: {
            requestId: `${studentName}-${slot.day}-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    })

    if (!firstMeetLink && res.data.hangoutLink) {
      firstMeetLink = res.data.hangoutLink
    }
  }

  if (!firstMeetLink) throw new Error('Calendar events created but no Meet link was returned.')
  return { meetLink: firstMeetLink, eventCount: schedule.length }
}
