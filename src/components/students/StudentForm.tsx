'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ClassScheduleEditor from '@/components/students/ClassScheduleEditor'
import CreateDriveFolderButton from '@/components/students/CreateDriveFolderButton'
import CreateCalendarEventButton from '@/components/students/CreateCalendarEventButton'
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
  fee_per_hour: 60,
  payment_method: 'Monthly',
  latest_payment: '',
  today_homework: '',
  notes: '',
  status: 'Active',
  is_active: true,
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
          fee_per_hour: student.fee_per_hour,
          payment_method: student.payment_method,
          latest_payment: student.latest_payment ?? '',
          today_homework: student.today_homework ?? '',
          notes: student.notes ?? '',
          status: student.status ?? 'Active',
          is_active: student.is_active,
        }
      : emptyForm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set<K extends keyof StudentInsert>(key: K, value: StudentInsert[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const supabase = createClient()
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

    try {
      if (student) {
        const { error: err } = await supabase.from('students').update(payload).eq('id', student.id)
        if (err) throw err
        onSaved?.()
        router.refresh()
      } else {
        const { error: err } = await supabase.from('students').insert(payload as StudentInsert)
        if (err) throw err
        router.push('/admin/students')
        router.refresh()
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!student) return
    if (!confirm(`Mark ${student.name} as Completed and hide from dashboard?`)) return
    const supabase = createClient()
    const { error: err } = await supabase.from('students').update({ status: 'Completed', is_active: false }).eq('id', student.id)
    if (err) { setError(`Failed to remove student: ${err.message}`); return }
    router.push('/admin/students')
    router.refresh()
  }

  return (
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
                <SelectItem value="IGCSE">IGCSE</SelectItem>
                <SelectItem value="University">University</SelectItem>
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
              onSuccess={(meetLink) => set('google_meet_link', meetLink)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_drive_link">Google Drive Link</Label>
            <Input id="google_drive_link" value={form.google_drive_link ?? ''} onChange={(e) => set('google_drive_link', e.target.value)} placeholder="https://drive.google.com/..." />
            <CreateDriveFolderButton
              name={form.name}
              meetLink={form.google_meet_link ?? ''}
              classSchedule={form.class_schedule ?? []}
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
            <Input id="today_homework" value={form.today_homework ?? ''} onChange={(e) => set('today_homework', e.target.value)} placeholder="e.g. Topic 6 Q1-3" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. We focus on ... only" rows={4} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3 flex-wrap">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : student ? 'Save Changes' : 'Add Student'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        {student && (
          <Button type="button" variant="destructive" className="ml-auto" onClick={handleDeactivate}>
            Remove Student
          </Button>
        )}
      </div>
    </form>
  )
}
