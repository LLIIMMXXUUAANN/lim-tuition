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

      let eventIds: string[] = calendar_event_ids ?? []

      if (!eventIds.length) {
        try {
          eventIds = await findRecurringEventIds(auth, name)
          if (!eventIds.length) return { name, status: 'skipped', reason: 'no Calendar events found — use Create Calendar Event' }
        } catch (err: unknown) {
          const raw = errMsg(err, 'Calendar search failed')
          return { name, status: 'error', reason: authExpired(raw) ? 'Google auth expired — reconnect' : raw }
        }
      }

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

        await supabase
          .from('students')
          .update({ calendar_event_ids: calResult.value.eventIds })
          .eq('id', id)

        const notes = [
          calendar_event_ids?.length ? undefined : 'IDs found via search',
          driveResult.status === 'rejected'
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
