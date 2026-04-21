import { createClient } from '@/lib/supabase/server'
import TimetableSection from '@/components/TimetableSection'
import type { Student, AvailabilitySlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TimetablePage() {
  const supabase = await createClient()

  const [studentsResult, availabilityResult] = await Promise.all([
    supabase.from('students').select('id, name, class_schedule, fee_per_hour').eq('status', 'Active').order('name'),
    supabase.from('tutor_availability').select('id, day, time_slot, slot_type').order('day').order('time_slot'),
  ])

  const students = studentsResult.error
    ? []
    : (studentsResult.data ?? []) as Pick<Student, 'id' | 'name' | 'class_schedule' | 'fee_per_hour'>[]

  const availability = availabilityResult.error
    ? []
    : (availabilityResult.data ?? []) as AvailabilitySlot[]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Timetable</h1>
      </div>
      <TimetableSection initialAvailability={availability} students={students} />
    </div>
  )
}
