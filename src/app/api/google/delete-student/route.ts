import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { parseDriveFolderId } from '@/lib/google/drive'
import { google } from 'googleapis'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as {
    drive_folder_url?: string | null
    calendar_event_ids?: string[] | null
  }
  const { drive_folder_url, calendar_event_ids } = body

  if (!drive_folder_url?.trim() && !calendar_event_ids?.length) {
    return NextResponse.json({ driveError: null, calendarError: null })
  }

  const auth = await getOAuth2Client()
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) return NextResponse.json({ error: 'GOOGLE_CALENDAR_ID env var is not set' }, { status: 500 })

  const [driveResult, calendarResult] = await Promise.allSettled([
    (async () => {
      if (!drive_folder_url?.trim()) return null
      const folderId = parseDriveFolderId(drive_folder_url)
      const drive = google.drive({ version: 'v3', auth })
      await drive.files.update({ fileId: folderId, requestBody: { trashed: true } })
    })(),
    (async () => {
      if (!calendar_event_ids?.length) return null
      const calendar = google.calendar({ version: 'v3', auth })
      await Promise.all(
        calendar_event_ids.filter(Boolean).map(eventId =>
          calendar.events.delete({ calendarId, eventId }).catch((err: unknown) => {
            console.error(`Failed to delete calendar event ${eventId}:`, err)
          })
        )
      )
    })(),
  ])

  const driveError = driveResult.status === 'rejected'
    ? (driveResult.reason instanceof Error ? driveResult.reason.message : 'Failed to trash Drive folder')
    : null

  const calendarError = calendarResult.status === 'rejected'
    ? (calendarResult.reason instanceof Error ? calendarResult.reason.message : 'Failed to delete Calendar events')
    : null

  return NextResponse.json({ driveError, calendarError })
}
