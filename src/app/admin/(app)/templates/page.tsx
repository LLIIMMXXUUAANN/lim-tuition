import { fetchFastAPI } from '@/lib/fastapi'
import TemplatesList from '@/features/templates/components/TemplatesList'
import type { Student } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const [templatesRes, studentsRes] = await Promise.all([
    fetchFastAPI('/templates'),
    fetchFastAPI('/students?status=Active'),
  ])

  const templatesData: { id: string; content: string }[] | null = templatesRes.ok
    ? await templatesRes.json()
    : null
  const activeStudents: Pick<Student, 'id' | 'name' | 'classSchedule' | 'feePerHour'>[] = studentsRes.ok
    ? await studentsRes.json()
    : []

  if (!templatesData) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-navy mb-4">Templates</h1>
        <p className="text-red-500">Failed to load templates.</p>
      </div>
    )
  }

  const byId = Object.fromEntries(templatesData.map((t) => [t.id, t.content]))

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Templates</h1>
      </div>
      <TemplatesList initialData={byId} students={activeStudents} />
    </div>
  )
}
