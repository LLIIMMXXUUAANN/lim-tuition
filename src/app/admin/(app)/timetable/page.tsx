import { createClient } from '@/services/supabase/server'
import TimetableSection from '@/features/timetable/components/TimetableSection'
import type { Student } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TimetablePage() {
  const supabase = await createClient()

  const [studentsResult, rulesResult, bufferResult] = await Promise.all([
    supabase.from('students').select('name, class_schedule').eq('status', 'Active').order('name'),
    supabase.from('settings').select('value').eq('key', 'timetable_rules').single(),
    supabase.from('settings').select('value').eq('key', 'timetable_buffer_mins').single(),
  ])

  if (studentsResult.error) console.error('[TimetablePage] failed to load students:', studentsResult.error.message)
  const students = studentsResult.error ? [] : (studentsResult.data ?? []) as Pick<Student, 'name' | 'class_schedule'>[]
  const initialRules = rulesResult.data?.value ?? ''
  const initialBufferMins = bufferResult.data ? parseInt(bufferResult.data.value, 10) : 15

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Timetable</h1>
      </div>
      <TimetableSection students={students} initialRules={initialRules} initialBufferMins={initialBufferMins} />
    </div>
  )
}
