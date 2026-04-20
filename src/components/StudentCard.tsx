import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Student } from '@/lib/types'

interface StudentCardProps {
  student: Student
}

const modeColor: Record<string, string> = {
  'My Python Syllabus': 'bg-blue-100 text-blue-800',
  'IGCSE': 'bg-purple-100 text-purple-800',
  'University': 'bg-green-100 text-green-800',
}

export default function StudentCard({ student }: StudentCardProps) {
  return (
    <Link href={`/students/${student.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{student.name}</CardTitle>
            <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${modeColor[student.mode] ?? 'bg-slate-100 text-slate-700'}`}>
              {student.mode}
            </span>
          </div>
          {student.contact_person && (
            <p className="text-sm text-slate-500">{student.contact_person}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {student.weekly_class_time && (
            <p className="text-slate-600">📅 {student.weekly_class_time}</p>
          )}
          <p className="text-slate-600">💰 RM{student.fee_per_hour}/hr · {student.payment_method}</p>
          {student.latest_payment && (
            <p className="text-slate-600">💳 {student.latest_payment}</p>
          )}
          {student.lecture_progress && (
            <p className="text-slate-600">📖 Lecture: {student.lecture_progress}</p>
          )}
          {student.homework_progress && (
            <p className="text-slate-600">✏️ HW: {student.homework_progress}</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
