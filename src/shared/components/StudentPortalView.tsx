import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import type { Student } from '@/lib/types'
import { Row, BlockField, statusBadge, ScheduleList, ExternalLink } from './student-fields'

export default function StudentPortalView({ student }: { student: Student }) {
  const schedule = student.classSchedule ?? []

  return (
    <div className="max-w-2xl mx-auto px-6 pt-6 pb-12 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-navy flex-1">{student.name}</h1>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge[student.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {student.status}
        </span>
      </div>

      {(student.googleMeetLink || student.googleDriveLink) && (
        <div className="flex gap-4">
          {student.googleMeetLink && <ExternalLink href={student.googleMeetLink}>Join Google Meet →</ExternalLink>}
          {student.googleDriveLink && <ExternalLink href={student.googleDriveLink}>Open Drive →</ExternalLink>}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Student Info</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Mode" value={student.mode} />
          <Row label="Student Phone" value={student.studentPhone} />
          <Row label="Contact Person" value={student.contactPerson} />
          <Row label="Contact Phone" value={student.contactPhone} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Class Schedule</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <ScheduleList schedule={schedule} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Fees &amp; Payment</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Fee Per Hour" value={`RM${student.feePerHour}`} />
          <Row label="Payment Method" value={student.paymentMethod} />
          <Row label="Latest Payment" value={student.latestPayment} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Progress</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <BlockField label="Today's Homework" value={student.todayHomework} />
          <BlockField label="Notes" value={student.notes} />
        </CardContent>
      </Card>
    </div>
  )
}
