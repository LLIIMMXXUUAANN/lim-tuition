import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import StudentForm from '@/components/StudentForm'
import { Button } from '@/components/ui/button'
import type { Student } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('students').select('*').eq('id', id).single()

  if (!data) notFound()

  const student = data as Student

  return (
    <div>
      <div className="max-w-2xl mx-auto px-6 pt-6 flex items-center gap-3">
        <Link href="/students">
          <Button variant="ghost" size="sm">← Back</Button>
        </Link>
        <h1 className="text-2xl font-bold">{student.name}</h1>
      </div>
      {student.google_meet_link && (
        <div className="max-w-2xl mx-auto px-6 pt-2">
          <a
            href={student.google_meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Join Google Meet →
          </a>
        </div>
      )}
      <StudentForm student={student} />
    </div>
  )
}
