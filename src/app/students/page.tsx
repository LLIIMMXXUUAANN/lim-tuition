import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import StudentCard from '@/components/StudentCard'
import type { Student } from '@/lib/types'

export default async function StudentsPage() {
  const supabase = await createClient()
  const { data: students } = await supabase
    .from('students')
    .select('*')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Students</h1>
        <Link href="/students/new">
          <Button>+ Add Student</Button>
        </Link>
      </div>

      {!students || students.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg">No students yet.</p>
          <p className="text-sm mt-1">Click &quot;Add Student&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(students as Student[]).map((s) => (
            <StudentCard key={s.id} student={s} />
          ))}
        </div>
      )}
    </div>
  )
}
