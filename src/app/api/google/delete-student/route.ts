import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'
import { getOAuth2Client } from '@/services/google/auth'
import { deleteStudentGoogle } from '@/services/google/cleanup'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    drive_folder_url?: string | null
    calendar_event_ids?: string[] | null
  }
  const { drive_folder_url, calendar_event_ids } = body

  if (!drive_folder_url?.trim() && !calendar_event_ids?.length) {
    return NextResponse.json({ driveError: null, calendarError: null })
  }

  const auth = await getOAuth2Client()
  const { driveError, calendarError } = await deleteStudentGoogle(auth, drive_folder_url, calendar_event_ids)
  return NextResponse.json({ driveError, calendarError })
}
