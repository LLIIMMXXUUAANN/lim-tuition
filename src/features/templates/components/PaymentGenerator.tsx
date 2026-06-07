'use client'

import { useState } from 'react'
import { useClipboard } from '@/hooks/useClipboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/select'
import type { Student, ClassSlot } from '@/lib/types'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface Props {
  students: Pick<Student, 'id' | 'name' | 'class_schedule' | 'fee_per_hour'>[]
}

export default function PaymentGenerator({ students }: Props) {
  const [studentId, setStudentId]       = useState('')
  const [month, setMonth]               = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return String(d.getMonth() + 1)
  })
  const [year, setYear]                 = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return String(d.getFullYear())
  })
  const [templateType, setTemplateType] = useState<'1' | '2'>('1')
  const [carryover, setCarryover]       = useState('1')

  const [status, setStatus]     = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [message, setMessage]   = useState('')
  const { copied, copy } = useClipboard()

  async function handleGenerate() {
    if (!studentId) return
    const parsedYear = parseInt(year, 10)
    if (!parsedYear || parsedYear < 2020 || parsedYear > 2100) return

    setStatus('loading')
    setMessage('')
    setErrorMsg('')

    try {
      const res = await fetch('/api/generate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          month: parseInt(month, 10),
          year: parsedYear,
          templateType: parseInt(templateType, 10) as 1 | 2,
          ...(templateType === '2' ? { carryover: parseInt(carryover, 10) || 0 } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Unknown error')
        setStatus('error')
        return
      }

      setMessage(data.message)
      setStatus('idle')
    } catch {
      setErrorMsg('Network error — could not reach the server.')
      setStatus('error')
    }
  }

  function handleCopy() {
    if (!message) return
    copy(message)
  }

  const isValid = !!studentId && !!month && !!year

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Generate Payment Message</CardTitle>
        <p className="text-sm text-slate-500 mt-0.5">
          Pick a student and month — dates are calculated automatically.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pg-student">Student</Label>
          <Select value={studentId} onValueChange={(v) => setStudentId(v ?? '')}>
            <SelectTrigger id="pg-student" className="w-full">
              <span className={studentId ? '' : 'text-muted-foreground'}>
                {studentId ? (students.find((s) => s.id === studentId)?.name ?? studentId) : 'Select a student…'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {students.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {studentId && (() => {
            const s = students.find((s) => s.id === studentId)
            if (!s) return null
            const slots = (s.class_schedule as ClassSlot[]) ?? []
            return (
              <p className="mt-1.5 px-1 text-xs text-slate-400">
                {slots.map((slot) => `${slot.day} · ${slot.start}–${slot.end}`).join('  ·  ')}  ·  RM{s.fee_per_hour}/hr
              </p>
            )
          })()}
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="pg-month">Month</Label>
            <Select value={month} onValueChange={(v) => setMonth(v ?? month)}>
              <SelectTrigger id="pg-month" className="w-full">
                <span>{MONTHS[parseInt(month, 10) - 1]}</span>
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((name, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28 space-y-1.5">
            <Label htmlFor="pg-year">Year</Label>
            <Input
              id="pg-year"
              type="number"
              min={2020}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pg-template">Template</Label>
          <Select value={templateType} onValueChange={(v) => setTemplateType((v ?? templateType) as '1' | '2')}>
            <SelectTrigger id="pg-template" className="w-full">
              <span>{templateType === '1' ? 'Payment 1 — Standard' : 'Payment 2 — With carryover'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Payment 1 — Standard</SelectItem>
              <SelectItem value="2">Payment 2 — With carryover</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {templateType === '2' && (
          <div className="space-y-1.5">
            <Label htmlFor="pg-carryover">Carryover sessions</Label>
            <Input
              id="pg-carryover"
              type="number"
              min={0}
              value={carryover}
              onChange={(e) => setCarryover(e.target.value)}
              className="w-28"
            />
          </div>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!isValid || status === 'loading'}
          className="w-full"
        >
          {status === 'loading' ? 'Generating…' : 'Generate'}
        </Button>

        {status === 'error' && (
          <p className="text-sm text-red-500">{errorMsg}</p>
        )}

        {message && (
          <div className="space-y-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-softBg rounded-lg p-3 border border-navy/10">
              {message}
            </p>
            <Button
              size="sm"
              variant={copied ? 'outline' : 'default'}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
