import { createClient } from '@/lib/supabase/server'
import TemplatesList from '@/components/templates/TemplatesList'
import type { Student } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const supabase = await createClient()

  const [templatesResult, studentsResult] = await Promise.all([
    supabase.from('templates').select('id, content').order('id'),
    supabase.from('students').select('id, name, class_schedule, fee_per_hour').eq('status', 'Active').order('name'),
  ])

  if (templatesResult.error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-navy mb-4">Templates</h1>
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Templates</h1>
      </div>
      <TemplatesList initialData={byId} students={activeStudents} />
    </div>
  )
}
