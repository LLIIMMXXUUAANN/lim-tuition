import { createClient } from '@/lib/supabase/server'
import TemplatesList from '@/components/TemplatesList'
import PaymentGenerator from '@/components/PaymentGenerator'
import TimetableSection from '@/components/TimetableSection'
import type { Student, AvailabilitySlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const supabase = await createClient()

  const [templatesResult, studentsResult, availabilityResult] = await Promise.all([
    supabase.from('templates').select('id, content').order('id'),
    supabase.from('students').select('id, name, class_schedule, fee_per_hour').eq('status', 'Active').order('name'),
    supabase.from('tutor_availability').select('id, day, time_slot, slot_type').order('day').order('time_slot'),
  ])

  if (templatesResult.error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Templates</h1>
        <p className="text-red-500">Failed to load templates: {templatesResult.error.message}</p>
      </div>
    )
  }

  const byId = Object.fromEntries(
    (templatesResult.data ?? []).map((t) => [t.id, t.content])
  )
  const activeStudents = studentsResult.error
    ? []
    : (studentsResult.data ?? []) as Pick<Student, 'id' | 'name' | 'class_schedule' | 'fee_per_hour'>[]

  const availability = availabilityResult.error
    ? []
    : (availabilityResult.data ?? []) as AvailabilitySlot[]

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
      </div>
      <div className="space-y-6">
        <PaymentGenerator students={activeStudents} />
        <TemplatesList initialData={byId} />
        <TimetableSection initialAvailability={availability} students={activeStudents} />
      </div>
    </div>
  )
}
