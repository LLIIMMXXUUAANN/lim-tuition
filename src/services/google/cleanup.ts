import { google } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import { parseDriveFolderId } from './drive'

export async function deleteStudentGoogle(
  auth: OAuth2Client,
  driveUrl?: string | null,
  eventIds?: string[] | null,
): Promise<{ driveError: string | null; calendarError: string | null }> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID

  const [driveResult, calendarResult] = await Promise.allSettled([
    (async () => {
      if (!driveUrl?.trim()) return null
      const folderId = parseDriveFolderId(driveUrl)
      const drive = google.drive({ version: 'v3', auth })
      await drive.files.update({ fileId: folderId, requestBody: { trashed: true } })
    })(),
    (async () => {
      if (!eventIds?.length) return null
      if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID env var is not set')
      const calendar = google.calendar({ version: 'v3', auth })
      await Promise.all(
        eventIds.filter(Boolean).map(eventId =>
          calendar.events.delete({ calendarId, eventId }).catch((err: unknown) => {
            console.error(`Failed to delete calendar event ${eventId}:`, err)
          })
        )
      )
    })(),
  ])

  return {
    driveError: driveResult.status === 'rejected'
      ? (driveResult.reason instanceof Error ? driveResult.reason.message : 'Failed to trash Drive folder')
      : null,
    calendarError: calendarResult.status === 'rejected'
      ? (calendarResult.reason instanceof Error ? calendarResult.reason.message : 'Failed to delete Calendar events')
      : null,
  }
}
