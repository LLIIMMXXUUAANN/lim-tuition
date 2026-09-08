'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
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
import { decamelizeKeys } from '@/lib/utils'
import { HttpError, parseRetryAfterMs } from '@/shared/lib/httpError'
import type { Student, ClassSlot } from '@/lib/types'

interface GeneratePaymentVars {
  studentId: string
  month: number
  year: number
  templateType: 1 | 2
  carryover?: number
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

interface Props {
  students: Pick<Student, 'id' | 'name' | 'classSchedule' | 'feePerHour'>[]
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

  const { copied, copy } = useClipboard()

  const generateMutation = useMutation({
    mutationFn: async (vars: GeneratePaymentVars) => {
      const res = await fetch('/api/payment/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decamelizeKeys(vars)),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(data.error ?? 'Unknown error', res.status, parseRetryAfterMs(res))
      return data.message as string
    },
  })

  function handleGenerate() {
    if (!studentId) return
    const parsedYear = parseInt(year, 10)
    if (!parsedYear || parsedYear < 2020 || parsedYear > 2100) return

    generateMutation.mutate({
      studentId,
      month: parseInt(month, 10),
      year: parsedYear,
      templateType: parseInt(templateType, 10) as 1 | 2,
      ...(templateType === '2' ? { carryover: parseInt(carryover, 10) || 0 } : {}),
    })
  }

  function handleCopy() {
    if (!generateMutation.data) return
    copy(generateMutation.data)
  }

  const isValid = !!studentId && !!month && !!year
  const errorMsg = generateMutation.error
    ? generateMutation.error instanceof HttpError
      ? generateMutation.error.message
      : 'Network error — could not reach the server.'
    : ''

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
            const slots = (s.classSchedule as ClassSlot[]) ?? []
            return (
              <p className="mt-1.5 px-1 text-xs text-slate-400">
                {slots.map((slot) => `${slot.day} · ${slot.start}–${slot.end}`).join('  ·  ')}  ·  RM{s.feePerHour}/hr
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
          disabled={!isValid || generateMutation.isPending}
          className="w-full"
        >
          {generateMutation.isPending ? 'Generating…' : 'Generate'}
        </Button>

        {generateMutation.isError && (
          <p className="text-sm text-red-500">{errorMsg}</p>
        )}

        {generateMutation.data && (
          <div className="space-y-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-softBg rounded-lg p-3 border border-navy/10">
              {generateMutation.data}
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
