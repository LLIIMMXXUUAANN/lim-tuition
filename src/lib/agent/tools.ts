import { createClient } from '@/lib/supabase/server'
import type { StudentMode, PaymentMethod, StudentStatus, ClassSlot } from '@/lib/types'
import { timeToMins, DAY_INDEX } from '@/lib/utils'
import { getOAuth2Client } from '@/lib/google/auth'
import { createWeeklyClassEvents, updateWeeklyClassEvents } from '@/lib/google/calendar'
import { createStudentDriveFolder, updateStudentMeetDoc } from '@/lib/google/drive'
import { deleteStudentGoogle } from '@/lib/google/cleanup'
import { syncAllStudents } from '@/lib/google/sync'

export type Supabase = Awaited<ReturnType<typeof createClient>>

export function errMsg(err: unknown, fallback = 'Unknown error') {
  return err instanceof Error ? err.message : fallback
}

export const ALLOWED_UPDATE_KEYS = new Set([
  'name', 'mode', 'fee_per_hour', 'payment_method', 'status',
  'class_schedule', 'contact_person', 'contact_phone', 'student_phone',
  'today_homework', 'notes', 'latest_payment',
  'google_meet_link', 'google_drive_link', 'access_emails',
])

export async function searchStudents(supabase: Supabase, query: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, status, class_schedule')
    .ilike('name', `%${query}%`)
    .order('name')
  if (error) return { error: error.message }
  return { students: data ?? [] }
}

export async function getStudent(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, status, mode, fee_per_hour, payment_method, class_schedule, contact_person, contact_phone, student_phone, today_homework, notes, latest_payment, google_meet_link, google_drive_link, calendar_event_ids, access_emails')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Student not found' }
  return { student: data }
}

export async function managePortalAccess(
  supabase: Supabase,
  studentId: string,
  action: 'add' | 'remove',
  email: string,
) {
  const normalised = email.trim().toLowerCase()

  const { data: student, error: fetchErr } = await supabase
    .from('students')
    .select('access_emails')
    .eq('id', studentId)
    .maybeSingle()
  if (fetchErr || !student) return { error: 'Student not found' }

  const current: string[] = student.access_emails ?? []

  let updated: string[]
  if (action === 'add') {
    if (current.includes(normalised)) return { result: `${normalised} already has access` }
    updated = [...current, normalised]
  } else {
    if (!current.includes(normalised)) return { result: `${normalised} does not have access` }
    updated = current.filter(e => e !== normalised)
  }

  const { error } = await supabase
    .from('students')
    .update({ access_emails: updated })
    .eq('id', studentId)
  if (error) return { error: error.message }

  return {
    result: action === 'add'
      ? `${normalised} can now log in to the student portal`
      : `${normalised} has been removed from portal access`,
  }
}

export async function listStudents(
  supabase: Supabase,
  params: { status?: string; day?: string },
) {
  const VALID_STATUSES = new Set(['Active', 'On Hold', 'Completed'])
  if (params.status && !VALID_STATUSES.has(params.status)) {
    return { error: `Invalid status: ${params.status}` }
  }

  let query = supabase
    .from('students')
    .select('id, name, status, mode, fee_per_hour, class_schedule')
    .order('name')

  if (params.status) query = query.eq('status', params.status)

  const { data, error } = await query
  if (error) return { error: error.message }

  let students = data ?? []
  if (params.day) {
    students = students.filter((s: { class_schedule: ClassSlot[] | null }) =>
      s.class_schedule?.some((slot: ClassSlot) => slot.day === params.day)
    )
  }

  return { students }
}

export async function createStudent(
  supabase: Supabase,
  params: {
    name: string
    mode: StudentMode
    fee_per_hour: number
    payment_method?: PaymentMethod
    status?: StudentStatus
    class_schedule?: ClassSlot[]
    contact_person?: string
    contact_phone?: string
    student_phone?: string
    today_homework?: string
    notes?: string
    latest_payment?: string
    access_emails?: string[]
    google_meet_link?: string
    google_drive_link?: string
  }
) {
  const { data, error } = await supabase
    .from('students')
    .insert({
      name: params.name,
      mode: params.mode,
      fee_per_hour: params.fee_per_hour,
      payment_method: params.payment_method ?? 'Monthly',
      status: params.status ?? 'Active',
      class_schedule: params.class_schedule ?? [],
      contact_person: params.contact_person ?? null,
      contact_phone: params.contact_phone ?? null,
      student_phone: params.student_phone ?? null,
      today_homework: params.today_homework ?? null,
      notes: params.notes ?? null,
      latest_payment: params.latest_payment ?? null,
      access_emails: params.access_emails ?? [],
      google_meet_link: params.google_meet_link ?? null,
      google_drive_link: params.google_drive_link ?? null,
    })
    .select('id, name')
    .single()
  if (error) return { error: error.message }
  return {
    student: data,
    ...(params.class_schedule?.length ? { suggestGoogleSetup: true } : {}),
  }
}

export async function updateStudent(
  supabase: Supabase,
  id: string,
  fields: Record<string, unknown>
) {
  const permitted = Object.fromEntries(
    Object.entries(fields).filter(([k]) => ALLOWED_UPDATE_KEYS.has(k))
  )
  if (Object.keys(permitted).length === 0) return { error: 'No valid fields to update' }

  if ('access_emails' in permitted) {
    permitted.access_emails = (permitted.access_emails as string[]).map(e => e.trim().toLowerCase())
  }

  const { error } = await supabase.from('students').update(permitted).eq('id', id)
  if (error) return { error: error.message }

  if (!('class_schedule' in permitted)) return { success: true }

  const { data: student } = await supabase
    .from('students')
    .select('name, calendar_event_ids, google_meet_link, google_drive_link')
    .eq('id', id)
    .maybeSingle()

  if (!student?.calendar_event_ids?.length || !student?.google_meet_link) {
    return { success: true, suggestGoogleSetup: true, studentId: id, studentName: student?.name }
  }

  let auth: Awaited<ReturnType<typeof getOAuth2Client>>
  try {
    auth = await getOAuth2Client()
  } catch (err) {
    return {
      success: true,
      googleWarnings: [`Schedule saved but Calendar not updated: ${errMsg(err, 'Google not connected')}`],
    }
  }

  const warnings: string[] = []

  const [calResult, driveResult] = await Promise.allSettled([
    updateWeeklyClassEvents(
      auth,
      student.name,
      permitted.class_schedule as ClassSlot[],
      student.calendar_event_ids,
      student.google_meet_link,
    ),
    student.google_drive_link
      ? updateStudentMeetDoc(
          auth,
          student.google_drive_link,
          student.name,
          permitted.class_schedule as ClassSlot[],
          student.google_meet_link,
        )
      : Promise.resolve(null),
  ])

  if (calResult.status === 'fulfilled') {
    const { error: dbErr } = await supabase
      .from('students')
      .update({ calendar_event_ids: calResult.value.eventIds })
      .eq('id', id)
    if (dbErr) warnings.push(`Calendar updated but event ID save failed: ${dbErr.message}`)
  } else {
    warnings.push(`Calendar update failed: ${errMsg(calResult.reason)}`)
  }

  if (driveResult.status === 'rejected') {
    warnings.push(`Drive Meet doc update failed: ${errMsg(driveResult.reason)}`)
  }

  return {
    success: true,
    ...(warnings.length ? { googleWarnings: warnings } : {}),
  }
}

export async function deleteStudent(supabase: Supabase, id: string) {
  const { data: student } = await supabase
    .from('students')
    .select('google_drive_link, calendar_event_ids')
    .eq('id', id)
    .maybeSingle()

  const warnings: string[] = []

  if (student?.google_drive_link || student?.calendar_event_ids?.length) {
    try {
      const auth = await getOAuth2Client()
      const { driveError, calendarError } = await deleteStudentGoogle(
        auth,
        student.google_drive_link,
        student.calendar_event_ids,
      )
      if (driveError) warnings.push(`Drive cleanup warning: ${driveError}`)
      if (calendarError) warnings.push(`Calendar cleanup warning: ${calendarError}`)
    } catch (err) {
      warnings.push(`Google cleanup skipped: ${errMsg(err, 'auth error')}`)
    }
  }

  const { error } = await supabase.from('students').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true, warnings: warnings.length ? warnings : undefined }
}

export async function setupStudentGoogle(supabase: Supabase, studentId: string) {
  const { data: student, error } = await supabase
    .from('students')
    .select('name, mode, class_schedule, calendar_event_ids, google_meet_link, google_drive_link')
    .eq('id', studentId)
    .single()

  if (error || !student) return { error: 'Student not found' }

  const { name, mode, class_schedule, calendar_event_ids, google_drive_link } = student
  let { google_meet_link } = student

  if (!class_schedule?.length) {
    return { error: 'Student has no class schedule — add a schedule before setting up Google.' }
  }

  const needsCalendar = !calendar_event_ids?.length
  const needsDrive = !google_drive_link

  if (!needsCalendar && !needsDrive) {
    return { result: 'Already fully set up — Calendar ✓, Drive ✓. Nothing to do.' }
  }

  let auth: Awaited<ReturnType<typeof getOAuth2Client>>
  try {
    auth = await getOAuth2Client()
  } catch (err) {
    return { error: errMsg(err, 'Google not connected') }
  }

  const summary: string[] = []

  if (needsCalendar) {
    try {
      const { meetLink, eventIds } = await createWeeklyClassEvents(
        auth, name, class_schedule as ClassSlot[],
      )
      const { error: calDbErr } = await supabase
        .from('students')
        .update({ google_meet_link: meetLink, calendar_event_ids: eventIds })
        .eq('id', studentId)
      if (calDbErr) return { error: `Calendar events created but DB save failed: ${calDbErr.message}` }
      google_meet_link = meetLink
      summary.push(`Calendar ✓ (${eventIds.length} event${eventIds.length !== 1 ? 's' : ''} created, Meet link saved)`)
    } catch (err) {
      return { error: `Calendar setup failed: ${errMsg(err)}` }
    }
  } else {
    summary.push('Calendar ✓ (already set up, skipped)')
  }

  if (needsDrive) {
    if (!google_meet_link) {
      return { error: 'No Meet link available — Calendar setup must succeed before Drive can be created.' }
    }
    try {
      const driveUrl = await createStudentDriveFolder(
        auth, name, google_meet_link, class_schedule as ClassSlot[], mode as StudentMode,
      )
      const { error: driveDbErr } = await supabase
        .from('students')
        .update({ google_drive_link: driveUrl })
        .eq('id', studentId)
      if (driveDbErr) {
        summary.push(`Drive ✗ (folder created but DB save failed: ${driveDbErr.message})`)
      } else {
        summary.push('Drive ✓ (folder created)')
      }
    } catch (err) {
      summary.push(`Drive ✗ (${errMsg(err)})`)
    }
  } else {
    summary.push('Drive ✓ (already set up, skipped)')
  }

  return { result: summary.join(', ') }
}

export async function runSyncAll(supabase: Supabase) {
  try {
    const auth = await getOAuth2Client()
    const results = await syncAllStudents(supabase, auth)
    return { results }
  } catch (err) {
    const msg = errMsg(err, 'Google auth failed')
    if (msg.includes('invalid_grant')) {
      return { error: 'Google auth expired — reconnect at /api/google/auth' }
    }
    return { error: msg }
  }
}

function getWeekdayDates(year: number, month: number, weekday: string): number[] {
  const dayIndex = DAY_INDEX[weekday]
  if (dayIndex === undefined) return []
  const dates: number[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== dayIndex) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month - 1) {
    dates.push(d.getDate())
    d.setDate(d.getDate() + 7)
  }
  return dates
}

export async function getSchedule(supabase: Supabase, day: string) {
  const { data, error } = await supabase
    .from('students')
    .select('id, name, class_schedule')
    .eq('status', 'Active')
  if (error) return { error: error.message }

  const students = (data ?? [])
    .filter(s => s.class_schedule?.some((slot: ClassSlot) => slot.day === day))
    .map(s => ({
      id: s.id,
      name: s.name,
      slots: ((s.class_schedule as ClassSlot[]) ?? [])
        .filter(slot => slot.day === day)
        .map(slot => ({ start: slot.start, end: slot.end })),
    }))

  return { day, students }
}

export async function getFeeSummary(supabase: Supabase, month?: number, year?: number) {
  const myt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
  const resolvedMonth = month ?? (myt.getMonth() + 1)
  const resolvedYear = year ?? myt.getFullYear()

  const { data, error } = await supabase
    .from('students')
    .select('id, name, fee_per_hour, class_schedule')
    .eq('status', 'Active')
  if (error) return { error: error.message }

  const students = (data ?? []).map(s => {
    const schedule = (s.class_schedule as ClassSlot[]) ?? []
    const slotsByDay = new Map<string, ClassSlot[]>()
    for (const slot of schedule) {
      slotsByDay.set(slot.day, [...(slotsByDay.get(slot.day) ?? []), slot])
    }
    let fee = 0
    for (const [day, slots] of slotsByDay) {
      const dates = getWeekdayDates(resolvedYear, resolvedMonth, day)
      const hoursPerSession = slots.reduce(
        (sum, slot) => sum + (timeToMins(slot.end) - timeToMins(slot.start)) / 60,
        0,
      )
      fee += dates.length * hoursPerSession * s.fee_per_hour
    }
    return { id: s.id, name: s.name, fee: Math.round(fee * 100) / 100, _raw: fee }
  })

  const total = Math.round(students.reduce((sum, s) => sum + s._raw, 0) * 100) / 100
  const out = students.map(({ _raw: _, ...s }) => s)
  return { month: resolvedMonth, year: resolvedYear, students: out, total }
}
