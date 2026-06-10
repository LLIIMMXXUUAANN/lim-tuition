'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import ClassScheduleEditor from './ClassScheduleEditor'
import CreateDriveFolderButton from './CreateDriveFolderButton'
import CreateCalendarEventButton from './CreateCalendarEventButton'
import type { Student, StudentInsert, StudentUpdate, StudentStatus } from '@/lib/types'

interface StudentFormProps {
  student?: Student
  onSaved?: () => void
}

const emptyForm: StudentInsert = {
  name: '',
  access_emails: [],
  contact_person: '',
  contact_phone: '',
  student_phone: '',
  mode: 'My Python Syllabus',
  class_schedule: [],
  google_meet_link: '',
  google_drive_link: '',
  calendar_event_ids: null,
  fee_per_hour: 60,
  payment_method: 'Monthly',
  latest_payment: '',
  today_homework: '',
  notes: '',
  status: 'Active',
}

export default function StudentForm({ student, onSaved }: StudentFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<StudentInsert>(
    student
      ? {
          name: student.name,
          access_emails: student.access_emails ?? [],
          contact_person: student.contact_person ?? '',
          contact_phone: student.contact_phone ?? '',
          student_phone: student.student_phone ?? '',
          mode: student.mode,
          class_schedule: student.class_schedule ?? [],
          google_meet_link: student.google_meet_link ?? '',
          google_drive_link: student.google_drive_link ?? '',
          calendar_event_ids: student.calendar_event_ids ?? null,
          fee_per_hour: student.fee_per_hour,
          payment_method: student.payment_method,
          latest_payment: student.latest_payment ?? '',
          today_homework: student.today_homework ?? '',
          notes: student.notes ?? '',
          status: student.status ?? 'Active',
        }
      : emptyForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calendarWarning, setCalendarWarning] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteGoogleError, setDeleteGoogleError] = useState('')

  function set<K extends keyof StudentInsert>(key: K, value: StudentInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setCalendarWarning('')
    setSaving(true)
    const payload: StudentUpdate = {
      ...form,
      access_emails: (form.access_emails ?? []).filter(e => e.trim() !== ''),
      contact_person: form.contact_person || null,
      contact_phone: form.contact_phone || null,
      student_phone: form.student_phone || null,
      google_meet_link: form.google_meet_link || null,
      google_drive_link: form.google_drive_link || null,
      latest_payment: form.latest_payment || null,
      today_homework: form.today_homework || null,
      notes: form.notes || null,
    }

    // Use a local variable so the warning is only shown after a successful DB save,
    // and so we can decide whether to keep the form open.
    let calendarMsg = ''

    if (student) {
      const scheduleChanged = JSON.stringify(form.class_schedule) !== JSON.stringify(student.class_schedule)
      if (scheduleChanged) {
        const hasEventIds = (form.calendar_event_ids ?? []).length > 0
        const hasMeetLink = !!form.google_meet_link
        if (hasEventIds && hasMeetLink) {
          try {
            const res = await fetch('/api/google/update-class-event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: form.name.trim(),
                class_schedule: form.class_schedule,
                event_ids: form.calendar_event_ids,
                meet_link: form.google_meet_link,
                drive_folder_url: form.google_drive_link || undefined,
              }),
            })
            const data = await res.json()
            if (res.ok) {
              payload.calendar_event_ids = data.eventIds
              if (data.meetLink) {
                payload.google_meet_link = data.meetLink
                set('google_meet_link', data.meetLink)
              }
              if (data.driveDocError) calendarMsg = `Calendar updated. Drive doc not updated: ${data.driveDocError}`
            } else {
              calendarMsg = `Calendar not updated: ${data.error ?? 'unknown error'}`
            }
          } catch {
            calendarMsg = 'Calendar not updated: network error'
          }
        } else if (!hasEventIds) {
          calendarMsg = 'Schedule saved — Google Calendar and Drive doc were not updated (no calendar event IDs). Click "Create Calendar Event" to set up sync.'
        } else {
          calendarMsg = 'Schedule saved — Google Calendar and Drive doc were not updated (Meet link is missing).'
        }
      }
    }

    try {
      if (student) {
        const res = await fetch(`/api/students/${student.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to save')
        }
        router.refresh()
        if (calendarMsg) {
          setCalendarWarning(calendarMsg)
          setSaving(false)
        } else {
          onSaved?.()
        }
      } else {
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Failed to save')
        }
        router.push('/admin/students')
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setSaving(false)
    }
  }

  function navigateAfterDelete() {
    router.push('/admin/students')
    router.refresh()
  }

  async function handleDelete() {
    if (!student) return
    setDeleting(true)
    setError('')
    setDeleteGoogleError('')

    try {
      const delRes = await fetch(`/api/students/${student.id}`, { method: 'DELETE' })
      const data = await delRes.json().catch(() => ({}))

      if (!delRes.ok) {
        setError(`Failed to delete student: ${data.error ?? 'unknown error'}`)
        setShowDeleteDialog(false)
        return
      }

      const googleError = [data.drive_error, data.calendar_error].filter(Boolean).join(' | ')
      if (googleError) {
        setDeleteGoogleError(googleError)
        return
      }

      navigateAfterDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
  <>
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader><CardTitle>Student Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="name">Student Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
            </div>
            <div className="space-y-2 w-36">
              <Label>Status</Label>
              <Select value={form.status ?? 'Active'} onValueChange={(v) => set('status', v as StudentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">🟢 Active</SelectItem>
                  <SelectItem value="On Hold">🟡 On Hold</SelectItem>
                  <SelectItem value="Completed">⚫ Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="student_phone">Student Phone</Label>
              <Input id="student_phone" type="tel" value={form.student_phone ?? ''} onChange={(e) => set('student_phone', e.target.value)} placeholder="e.g. 012-3456789" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input id="contact_person" value={form.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} placeholder="e.g. Mrs. Pooi Kit" />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input id="contact_phone" type="tel" value={form.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} placeholder="e.g. 012-3456789" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mode *</Label>
            <Select value={form.mode} onValueChange={(v) => set('mode', v as StudentInsert['mode'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="My Python Syllabus">My Python Syllabus</SelectItem>
                <SelectItem value="Other Syllabus">Other Syllabus</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Class Schedule</Label>
            <ClassScheduleEditor
              value={form.class_schedule ?? []}
              onChange={(slots) => set('class_schedule', slots)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_meet_link">Google Meet Link</Label>
            <Input id="google_meet_link" value={form.google_meet_link ?? ''} onChange={(e) => set('google_meet_link', e.target.value)} placeholder="https://meet.google.com/..." />
            <CreateCalendarEventButton
              name={form.name}
              classSchedule={form.class_schedule ?? []}
              onSuccess={(meetLink, eventIds) => {
                set('google_meet_link', meetLink)
                set('calendar_event_ids', eventIds)
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_drive_link">Google Drive Link</Label>
            <Input id="google_drive_link" value={form.google_drive_link ?? ''} onChange={(e) => set('google_drive_link', e.target.value)} placeholder="https://drive.google.com/..." />
            <CreateDriveFolderButton
              name={form.name}
              meetLink={form.google_meet_link ?? ''}
              classSchedule={form.class_schedule ?? []}
              mode={form.mode}
              onSuccess={(url) => set('google_drive_link', url)}
            />
          </div>
          <div className="space-y-2">
            <Label>Portal Access Emails</Label>
            <p className="text-xs text-slate-500">Anyone with these emails can log in to the student portal and view this student&apos;s info.</p>
            <div className="space-y-2">
              {(form.access_emails ?? []).map((email, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      const updated = [...(form.access_emails ?? [])]
                      updated[i] = e.target.value
                      set('access_emails', updated)
                    }}
                    placeholder="email@example.com"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => set('access_emails', (form.access_emails ?? []).filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-red-500 text-lg leading-none px-1"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set('access_emails', [...(form.access_emails ?? []), ''])}
              >
                + Add email
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Fees &amp; Payment</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fee_per_hour">Fee Per Hour (RM) *</Label>
            <Input id="fee_per_hour" type="number" value={form.fee_per_hour} onChange={(e) => set('fee_per_hour', parseFloat(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label>Payment Method *</Label>
            <Select value={form.payment_method} onValueChange={(v) => set('payment_method', v as StudentInsert['payment_method'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="latest_payment">Latest Payment Status</Label>
            <Input id="latest_payment" value={form.latest_payment ?? ''} onChange={(e) => set('latest_payment', e.target.value)} placeholder="e.g. April done" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="today_homework">Today&apos;s Homework</Label>
            <Textarea id="today_homework" value={form.today_homework ?? ''} onChange={(e) => set('today_homework', e.target.value)} placeholder="e.g. Topic 6 Q1-3" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. We focus on ... only" rows={4} />
          </div>
        </CardContent>
      </Card>

      {calendarWarning && <p className="text-sm text-amber-600">{calendarWarning}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 flex-wrap">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : student ? 'Save Changes' : 'Add Student'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        {student && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={() => setShowDeleteDialog(true)}>
            Remove Student
          </Button>
        )}
      </div>

    </form>

    {student && showDeleteDialog && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Delete Student?</h2>
          {deleteGoogleError ? (
            <>
              <p className="text-sm text-green-700">Student deleted successfully.</p>
              <p className="text-sm text-amber-600">Google cleanup had issues: {deleteGoogleError}</p>
              <div className="flex justify-end">
                <Button type="button" onClick={navigateAfterDelete}>
                  Close
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                This will permanently delete <strong>{student.name}</strong>&apos;s Google Drive folder, Calendar events, and all student data. This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteDialog(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Student'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    )}
  </>
  )
}
