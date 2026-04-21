import { createClient } from '@/lib/supabase/server'
import TimetableSection from '@/components/TimetableSection'
import type { Student } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TimetablePage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('students')
    .select('name, class_schedule')
    .eq('status', 'Active')
    .order('name')

  if (error) console.error('[TimetablePage] failed to load students:', error.message)
  const students = error ? [] : (data ?? []) as Pick<Student, 'name' | 'class_schedule'>[]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timetable</h1>
      </div>
      <TimetableSection students={students} />
    </div>
  )
}
