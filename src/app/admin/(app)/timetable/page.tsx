import { fetchFastAPI } from '@/lib/fastapi'
import TimetableSection from '@/features/timetable/components/TimetableSection'
import type { Student } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function TimetablePage() {
  const [studentsRes, rulesRes, bufferRes] = await Promise.all([
    fetchFastAPI('/students?status=Active'),
    fetchFastAPI('/timetable/rules'),
    fetchFastAPI('/timetable/buffer-mins'),
  ])

  const students: Pick<Student, 'name' | 'class_schedule'>[] = studentsRes.ok ? await studentsRes.json() : []
  const { rules: initialRules = '' } = rulesRes.ok ? await rulesRes.json() : {}
  const { bufferMins: initialBufferMins = 15 } = bufferRes.ok ? await bufferRes.json() : {}

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-navy">Timetable</h1>
      </div>
      <TimetableSection students={students} initialRules={initialRules} initialBufferMins={initialBufferMins} />
    </div>
  )
}
