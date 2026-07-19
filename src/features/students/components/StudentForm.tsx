'use client'

import { useRef, useState } from 'react'
import equal from 'fast-deep-equal'
import { useRouter } from 'next/navigation'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import ClassScheduleEditor from './ClassScheduleEditor'
import { ExternalLink } from '@/shared/components/student-fields'
import { decamelizeKeys } from '@/lib/utils'
import type { Student, StudentInsert, StudentMode, PaymentMethod, StudentStatus } from '@/lib/types'

interface StudentFormProps {
  student?: Student
  onSaved?: () => void
}

const emptyForm: StudentInsert = {
  name: '',
  accessEmails: [],
  contactPerson: '',
  contactPhone: '',
  studentPhone: '',
  mode: 'My Python Syllabus',
  classSchedule: [],
  feePerHour: 60,
  paymentMethod: 'Monthly',
  latestPayment: '',
  todayHomework: '',
  notes: '',
  status: 'Active',
}

export default function StudentForm({ student, onSaved }: StudentFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<StudentInsert>(
    student
      ? {
          name: student.name,
          accessEmails: student.accessEmails ?? [],
          contactPerson: student.contactPerson ?? '',
          contactPhone: student.contactPhone ?? '',
          studentPhone: student.studentPhone ?? '',
          mode: student.mode,
          classSchedule: student.classSchedule ?? [],
          feePerHour: student.feePerHour,
          paymentMethod: student.paymentMethod,
          latestPayment: student.latestPayment ?? '',
          todayHomework: student.todayHomework ?? '',
          notes: student.notes ?? '',
          status: student.status ?? 'Active',
        }
      : emptyForm
  )
  const isSubmittingRef = useRef(false)
  const idempotencyKeyRef = useRef<string | null>(null)
  const lastSubmittedPayloadRef = useRef<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [googleWarning, setGoogleWarning] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteGoogleError, setDeleteGoogleError] = useState('')

  function set<K extends keyof StudentInsert>(key: K, value: StudentInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault()
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setError('')
    setGoogleWarning('')
    setSaving(true)
    const payload = decamelizeKeys({
      ...form,
      accessEmails: (form.accessEmails ?? []).filter(e => e.trim() !== ''),
      contactPerson: form.contactPerson || null,
      contactPhone: form.contactPhone || null,
      studentPhone: form.studentPhone || null,
      latestPayment: form.latestPayment || null,
      todayHomework: form.todayHomework || null,
      notes: form.notes || null,
    })

    try {
      if (student) {
        const res = await fetch(`/api/students/${student.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to save')
        router.refresh()
        if (data.googleWarning) {
          setGoogleWarning(data.googleWarning)
          setSaving(false)
        } else {
          onSaved?.()
        }
      } else {
        if (idempotencyKeyRef.current !== null && !equal(lastSubmittedPayloadRef.current, payload)) {
          // Content changed since the last attempt under this key — this is a
          // new logical request, not a retry. Rotate before sending so the
          // backend never sees a stale-key/changed-payload mismatch at all.
          idempotencyKeyRef.current = null
        }
        if (idempotencyKeyRef.current === null) {
          idempotencyKeyRef.current = crypto.randomUUID()
        }
        lastSubmittedPayloadRef.current = payload
        const res = await fetch('/api/students', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKeyRef.current,
          },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to save')
        // Rotate on success so a later resubmit from this same mounted form
        // (e.g. editing fields after a googleWarning instead of Cancel) is a
        // new create, not a replay of this one.
        idempotencyKeyRef.current = null
        lastSubmittedPayloadRef.current = null
        if (data.googleWarning) {
          setGoogleWarning(data.googleWarning)
          setSaving(false)
        } else {
          router.push('/admin/students')
          router.refresh()
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setSaving(false)
    } finally {
      isSubmittingRef.current = false
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

      const googleError = [data.driveError, data.calendarError].filter(Boolean).join(' | ')
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
              <Label htmlFor="studentPhone">Student Phone</Label>
              <Input id="studentPhone" type="tel" value={form.studentPhone ?? ''} onChange={(e) => set('studentPhone', e.target.value)} placeholder="e.g. 012-3456789" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="contactPerson">Contact Person</Label>
              <Input id="contactPerson" value={form.contactPerson ?? ''} onChange={(e) => set('contactPerson', e.target.value)} placeholder="e.g. Mrs. Pooi Kit" />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input id="contactPhone" type="tel" value={form.contactPhone ?? ''} onChange={(e) => set('contactPhone', e.target.value)} placeholder="e.g. 012-3456789" />
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
              value={form.classSchedule ?? []}
              onChange={(slots) => set('classSchedule', slots)}
            />
            {student?.googleMeetLink && (
              <p className="text-sm text-slate-500">
                Meet: <ExternalLink href={student.googleMeetLink}>{student.googleMeetLink}</ExternalLink>
              </p>
            )}
            {student?.googleDriveLink && (
              <p className="text-sm text-slate-500">
                Drive: <ExternalLink href={student.googleDriveLink}>{student.googleDriveLink}</ExternalLink>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Portal Access Emails</Label>
            <p className="text-xs text-slate-500">Anyone with these emails can log in to the student portal and view this student&apos;s info.</p>
            <div className="space-y-2">
              {(form.accessEmails ?? []).map((email, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      const updated = [...(form.accessEmails ?? [])]
                      updated[i] = e.target.value
                      set('accessEmails', updated)
                    }}
                    placeholder="email@example.com"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => set('accessEmails', (form.accessEmails ?? []).filter((_, j) => j !== i))}
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
                onClick={() => set('accessEmails', [...(form.accessEmails ?? []), ''])}
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
            <Label htmlFor="feePerHour">Fee Per Hour (RM) *</Label>
            <Input id="feePerHour" type="number" value={form.feePerHour} onChange={(e) => set('feePerHour', parseFloat(e.target.value))} required />
          </div>
          <div className="space-y-2">
            <Label>Payment Method *</Label>
            <Select value={form.paymentMethod} onValueChange={(v) => set('paymentMethod', v as StudentInsert['paymentMethod'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Monthly">Monthly</SelectItem>
                <SelectItem value="Weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="latestPayment">Latest Payment Status</Label>
            <Input id="latestPayment" value={form.latestPayment ?? ''} onChange={(e) => set('latestPayment', e.target.value)} placeholder="e.g. April done" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Progress</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="todayHomework">Today&apos;s Homework</Label>
            <Textarea id="todayHomework" value={form.todayHomework ?? ''} onChange={(e) => set('todayHomework', e.target.value)} placeholder="e.g. Topic 6 Q1-3" rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. We focus on ... only" rows={4} />
          </div>
        </CardContent>
      </Card>

      {googleWarning && <p className="text-sm text-amber-600">{googleWarning}</p>}
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
