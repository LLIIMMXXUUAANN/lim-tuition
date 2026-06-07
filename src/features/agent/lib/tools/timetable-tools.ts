import type { ClassSlot } from '@/lib/types'
import { runSlotGeneration, type ClassifiedSlot } from '@/features/timetable/lib/timetable-slots'
import { errMsg, type Supabase } from './shared'

export async function getTimetableSettings(supabase: Supabase) {
  const [rulesRow, bufferRow] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'timetable_rules').maybeSingle(),
    supabase.from('settings').select('value').eq('key', 'timetable_buffer_mins').maybeSingle(),
  ])
  return {
    rules: rulesRow.data?.value ?? '',
    bufferMins: bufferRow.data ? parseInt(bufferRow.data.value, 10) : 15,
  }
}

export async function updateTimetableRules(supabase: Supabase, rules: string) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_rules', value: rules }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function updateBufferMins(supabase: Supabase, bufferMins: number) {
  if (bufferMins < 0 || bufferMins > 60) return { error: 'bufferMins must be 0–60' }
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_buffer_mins', value: String(bufferMins) }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return { ok: true }
}

export async function generateSlotAvailability(
  supabase: Supabase,
  studentAvailability: string,
): Promise<{ slots: ClassifiedSlot[] } | { error: string }> {
  const [rulesRow, bufferRow, studentsRow] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'timetable_rules').maybeSingle(),
    supabase.from('settings').select('value').eq('key', 'timetable_buffer_mins').maybeSingle(),
    supabase.from('students').select('class_schedule').eq('status', 'Active'),
  ])

  const rules = rulesRow.data?.value ?? ''
  if (!rules.trim()) return { error: 'No timetable rules configured. Use update_timetable_rules first.' }

  const bufferMins = bufferRow.data ? parseInt(bufferRow.data.value, 10) : 15
  const bookedSlots = (studentsRow.data ?? []).flatMap(s => (s.class_schedule as ClassSlot[]) ?? [])

  try {
    const slots = await runSlotGeneration(rules, studentAvailability, bookedSlots, bufferMins)
    return { slots }
  } catch (err) {
    return { error: errMsg(err, 'Slot generation failed') }
  }
}

export async function downloadTimetableImage(supabase: Supabase) {
  const { data, error } = await supabase
    .from('students')
    .select('name, class_schedule')
    .eq('status', 'Active')
    .order('name')
  if (error) return { error: error.message }
  return {
    students: (data ?? []).map(s => ({
      name: s.name as string,
      class_schedule: (s.class_schedule as ClassSlot[]) ?? [],
    })),
  }
}
