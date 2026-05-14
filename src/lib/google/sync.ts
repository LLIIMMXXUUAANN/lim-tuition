import type { createClient } from '@/lib/supabase/server'
import type { OAuth2Client } from 'google-auth-library'
import { findRecurringEventIds, updateWeeklyClassEvents } from '@/lib/google/calendar'
import { updateStudentMeetDoc } from '@/lib/google/drive'
import type { ClassSlot } from '@/lib/types'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface SyncResult {
  name: string
  status: 'synced' | 'skipped' | 'error'
  reason?: string
}

function authExpired(msg: string) {
  return msg.includes('invalid_grant')
}

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export async function syncAllStudents(supabase: Supabase, auth: OAuth2Client): Promise<SyncResult[]> {
  const { data: students, error: fetchError } = await supabase
    .from('students')
    .select('id, name, class_schedule, calendar_event_ids, google_meet_link, google_drive_link')
    .eq('status', 'Active')
    .order('name')

  if (fetchError) throw new Error(fetchError.message)

  return Promise.all(
    (students ?? []).map(async (student): Promise<SyncResult> => {
      const { id, name, class_schedule, calendar_event_ids, google_meet_link, google_drive_link } = student

      if (!class_schedule?.length) return { name, status: 'skipped', reason: 'no class schedule' }
      if (!google_meet_link) return { name, status: 'skipped', reason: 'no Meet link' }

      // Always search Calendar by name so we discover any events whose IDs are
      // missing or wrong in the DB (e.g. rogue events from previous bad syncs).
      // Merge with whatever is already in the DB and deduplicate.
      const dbIds: string[] = calendar_event_ids ?? []
      let searchIds: string[] = []
      try {
        searchIds = await findRecurringEventIds(auth, name)
      } catch (err: unknown) {
        const raw = errMsg(err, 'Calendar search failed')
        if (authExpired(raw)) return { name, status: 'error', reason: 'Google auth expired — reconnect' }
        // Non-fatal: fall back to DB IDs only
      }
      const eventIds = [...new Set([...dbIds, ...searchIds])]
      if (!eventIds.length) return { name, status: 'skipped', reason: 'no Calendar events found — use Create Calendar Event' }

      try {
        const [calResult, driveResult] = await Promise.allSettled([
          updateWeeklyClassEvents(auth, name, class_schedule as ClassSlot[], eventIds, google_meet_link),
          google_drive_link
            ? updateStudentMeetDoc(auth, google_drive_link, name, class_schedule as ClassSlot[], google_meet_link)
            : Promise.resolve(null),
        ])

        if (calResult.status === 'rejected') {
          const raw = errMsg(calResult.reason, 'Calendar update failed')
          return { name, status: 'error', reason: authExpired(raw) ? 'Google auth expired — reconnect' : raw }
        }

        const { eventIds: newEventIds, meetLink: newMeetLink } = calResult.value
        const dbUpdate: Record<string, unknown> = { calendar_event_ids: newEventIds }
        if (newMeetLink) dbUpdate.google_meet_link = newMeetLink
        await supabase.from('students').update(dbUpdate).eq('id', id)

        // Primary was regenerated — re-update Drive doc with the new Meet link
        let driveUpdateError: string | undefined
        if (newMeetLink && google_drive_link) {
          try {
            await updateStudentMeetDoc(auth, google_drive_link, name, class_schedule as ClassSlot[], newMeetLink)
          } catch (err) {
            driveUpdateError = errMsg(err, 'failed')
          }
        }

        const notes = [
          calendar_event_ids?.length ? undefined : 'IDs found via search',
          newMeetLink ? 'new Meet link generated (primary was missing)' : undefined,
          driveUpdateError
            ? `Drive doc (new link): ${driveUpdateError}`
            : driveResult.status === 'rejected' && !newMeetLink
              ? `Drive doc: ${errMsg(driveResult.reason, 'failed')}`
              : undefined,
        ].filter(Boolean).join(' · ')

        return { name, status: 'synced', reason: notes || undefined }
      } catch (err: unknown) {
        return { name, status: 'error', reason: errMsg(err, 'Unknown error') }
      }
    })
  )
}
