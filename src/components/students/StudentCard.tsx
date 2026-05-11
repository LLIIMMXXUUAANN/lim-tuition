import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Student, ClassSlot } from '@/lib/types'
import { formatTime } from '@/lib/utils'
import { statusBadge } from '@/components/shared/student-fields'

interface StudentCardProps {
  student: Student
  slot?: ClassSlot  // when shown under a specific day, highlight that slot's time
}

const modeColor: Record<string, string> = {
  'My Python Syllabus': 'bg-blue-100 text-blue-800',
  'Other Syllabus': 'bg-purple-100 text-purple-800',
}

export default function StudentCard({ student, slot }: StudentCardProps) {
  return (
    <Link href={`/admin/students/${student.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-lg">{student.name}</CardTitle>
            <div className="flex gap-1 flex-shrink-0">
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[student.status] ?? 'bg-slate-100 text-slate-500'}`}>
                {student.status}
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${modeColor[student.mode] ?? 'bg-slate-100 text-slate-700'}`}>
                {student.mode}
              </span>
            </div>
          </div>
          {student.contact_person && (
            <p className="text-sm text-slate-500">{student.contact_person}</p>
          )}
        </CardHeader>
        <CardContent className="text-sm">
          {slot ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-slate-600">🕐 {formatTime(slot.start)} – {formatTime(slot.end)}</p>
              <p className="text-slate-400 text-xs">💳 {student.payment_method}</p>
            </div>
          ) : student.class_schedule?.length > 0 ? (
            <div className="text-slate-600 space-y-0.5">
              {student.class_schedule.map((s, i) => (
                <p key={i}>📅 {s.day} {formatTime(s.start)} – {formatTime(s.end)}</p>
              ))}
              <div className="flex justify-end">
                <p className="text-slate-400 text-xs">💳 {student.payment_method}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 italic">No schedule set</p>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
