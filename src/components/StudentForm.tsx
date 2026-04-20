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
import type { Student, StudentInsert, StudentUpdate } from '@/lib/types'

interface StudentFormProps {
  student?: Student
}

const emptyForm: StudentInsert = {
  name: '',
  contact_person: '',
  mode: 'My Python Syllabus',
  weekly_class_time: '',
  google_meet_link: '',
  fee_per_hour: 60,
  payment_method: 'Monthly',
  latest_payment: '',
  previous_class: '',
  today_homework: '',
  lecture_progress: '',
  homework_progress: '',
  notes: '',
  is_active: true,
}

export default function StudentForm({ student }: StudentFormProps) {
  const router = useRouter()
  const [form, setForm] = useState<StudentInsert>(
    student
      ? {
          name: student.name,
          contact_person: student.contact_person ?? '',
          mode: student.mode,
          weekly_class_time: student.weekly_class_time ?? '',
          google_meet_link: student.google_meet_link ?? '',
          fee_per_hour: student.fee_per_hour,
          payment_method: student.payment_method,
          latest_payment: student.latest_payment ?? '',
          previous_class: student.previous_class ?? '',
          today_homework: student.today_homework ?? '',
          lecture_progress: student.lecture_progress ?? '',
          homework_progress: student.homework_progress ?? '',
          notes: student.notes ?? '',
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
      contact_person: form.contact_person || null,
      weekly_class_time: form.weekly_class_time || null,
      google_meet_link: form.google_meet_link || null,
      latest_payment: form.latest_payment || null,
      previous_class: form.previous_class || null,
      today_homework: form.today_homework || null,
      lecture_progress: form.lecture_progress || null,
      homework_progress: form.homework_progress || null,
      notes: form.notes || null,
    }

    try {
      if (student) {
        const { error: err } = await supabase.from('students').update(payload).eq('id', student.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('students').insert(payload as StudentInsert)
        if (err) throw err
      }
      router.push('/students')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save. Try again.')
      setSaving(false)
    }
  }

  async function handleDeactivate() {
    if (!student) return
    if (!confirm(`Remove ${student.name} from active students?`)) return
    const supabase = createClient()
    await supabase.from('students').update({ is_active: false }).eq('id', student.id)
    router.push('/students')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader><CardTitle>Student Info</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Student Name *</Label>
            <Input id="name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_person">Contact Person</Label>
            <Input id="contact_person" value={form.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} placeholder="e.g. Mrs. Pooi Kit" />
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
            <Label htmlFor="weekly_class_time">Weekly Class Time</Label>
            <Input id="weekly_class_time" value={form.weekly_class_time ?? ''} onChange={(e) => set('weekly_class_time', e.target.value)} placeholder="e.g. Monday 2:30pm-4:30pm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="google_meet_link">Google Meet Link</Label>
            <Input id="google_meet_link" value={form.google_meet_link ?? ''} onChange={(e) => set('google_meet_link', e.target.value)} placeholder="https://meet.google.com/..." />
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
                <SelectItem value="Per Class">Per Class</SelectItem>
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
            <Label htmlFor="previous_class">Previous Class</Label>
            <Input id="previous_class" value={form.previous_class ?? ''} onChange={(e) => set('previous_class', e.target.value)} placeholder="e.g. Topic 6 Slide 1 to Slide 5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="today_homework">Today&apos;s Homework</Label>
            <Input id="today_homework" value={form.today_homework ?? ''} onChange={(e) => set('today_homework', e.target.value)} placeholder="e.g. Topic 6 Q1-3" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lecture_progress">Lecture Progress</Label>
            <Input id="lecture_progress" value={form.lecture_progress ?? ''} onChange={(e) => set('lecture_progress', e.target.value)} placeholder="e.g. Until T6 Slide 5" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="homework_progress">Homework Progress</Label>
            <Input id="homework_progress" value={form.homework_progress ?? ''} onChange={(e) => set('homework_progress', e.target.value)} placeholder="e.g. Until Topic 5 Q20" />
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
