'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { formatTime } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import StudentForm from '@/components/students/StudentForm'
import type { Student } from '@/lib/types'
import { Row, BlockField, statusBadge } from '@/components/shared/student-fields'

export default function StudentDetail({ student }: { student: Student }) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div>
        <div className="max-w-2xl mx-auto px-6 pt-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>← Cancel</Button>
          <h1 className="text-2xl font-bold">Editing: {student.name}</h1>
        </div>
        <StudentForm student={student} onSaved={() => setEditing(false)} />
      </div>
    )
  }

  const schedule = student.class_schedule ?? []

  return (
    <div className="max-w-2xl mx-auto px-6 pt-6 pb-12 space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/admin/students">
          <Button variant="ghost" size="sm">← Back</Button>
        </Link>
        <h1 className="text-2xl font-bold flex-1">{student.name}</h1>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[student.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {student.status}
        </span>
        <Button onClick={() => setEditing(true)}>Edit</Button>
      </div>

      {(student.google_meet_link || student.google_drive_link) && (
        <div className="flex gap-4">
          {student.google_meet_link && (
            <a href={student.google_meet_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Join Google Meet →
            </a>
          )}
          {student.google_drive_link && (
            <a href={student.google_drive_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
              Open Drive →
            </a>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Student Info</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Mode" value={student.mode} />
          <Row label="Student Phone" value={student.student_phone} />
          <Row label="Contact Person" value={student.contact_person} />
          <Row label="Contact Phone" value={student.contact_phone} />
          {student.access_emails && student.access_emails.length > 0 && (
            <div className="flex gap-2">
              <span className="text-slate-500 w-40 flex-shrink-0">Portal Access</span>
              <div className="space-y-0.5">
                {student.access_emails.map((email, i) => (
                  <p key={i} className="text-slate-800">{email}</p>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Class Schedule</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {schedule.length === 0 ? (
            <p className="text-slate-400 italic">No schedule set</p>
          ) : (
            <div className="space-y-1">
              {schedule.map((slot, i) => (
                <p key={i} className="text-slate-700">📅 {slot.day} &nbsp; {formatTime(slot.start)} – {formatTime(slot.end)}</p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fees &amp; Payment</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Fee Per Hour" value={`RM${student.fee_per_hour}`} />
          <Row label="Payment Method" value={student.payment_method} />
          <Row label="Latest Payment" value={student.latest_payment} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <BlockField label="Today's Homework" value={student.today_homework} />
          <BlockField label="Notes" value={student.notes} />
        </CardContent>
      </Card>
    </div>
  )
}
