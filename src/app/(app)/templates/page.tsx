'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

function formatDates(dates: string[]): string {
  if (dates.length === 0) return '—'
  if (dates.length === 1) return dates[0]
  if (dates.length === 2) return `${dates[0]} and ${dates[1]}`
  return `${dates.slice(0, -1).join(', ')}, and ${dates[dates.length - 1]}`
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    await navigator.clipboard.writeText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button size="sm" variant={copied ? 'outline' : 'default'} onClick={handleCopy} className="shrink-0">
      {copied ? 'Copied!' : 'Copy'}
    </Button>
  )
}

// ── Payment Template ──────────────────────────────────────────────────────────

function PaymentTemplate() {
  const [name, setName] = useState('')
  const [month, setMonth] = useState('')
  const [dates, setDates] = useState<string[]>([''])
  const [feePerSession, setFeePerSession] = useState(60)

  const filledDates = dates.filter((d) => d.trim())
  const total = filledDates.length * feePerSession

  function preview() {
    const n = name || 'XXX'
    const m = month || 'XXX'
    const count = filledDates.length || 'XXX'
    const dateList = filledDates.length > 0 ? formatDates(filledDates) : 'XXX, XXX, ...'
    const amt = filledDates.length > 0 ? total : 'XXX'
    return `Hi ${n}, just a gentle reminder regarding the tuition fee. There are ${count} sessions in ${m} (${dateList}), bringing the total to RM${amt}. Thank you 😃`
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Payment Request</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">Monthly fee reminder. Fill in the fields and copy.</p>
          </div>
          <CopyButton getText={preview} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Parent name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mr. Lim" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="e.g. July" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fee per session (RM)</Label>
            <Input
              type="number"
              value={feePerSession}
              onChange={(e) => setFeePerSession(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Session dates</Label>
          <div className="flex flex-wrap gap-2 items-center">
            {dates.map((d, i) => (
              <div key={i} className="flex gap-1 items-center">
                <Input
                  value={d}
                  onChange={(e) => setDates((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                  placeholder="e.g. 1st"
                  className="w-24"
                />
                {dates.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDates((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-slate-600 p-1"
                    aria-label="Remove date"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDates((prev) => [...prev, ''])}
            >
              + Add date
            </Button>
          </div>
          {filledDates.length > 0 && (
            <p className="text-xs text-slate-400">
              {filledDates.length} session{filledDates.length !== 1 ? 's' : ''} × RM{feePerSession} = RM{total}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-400">Preview</Label>
          <div className="text-sm text-slate-700 bg-slate-50 rounded-md p-4 border leading-relaxed">
            {preview()}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Editable text template ────────────────────────────────────────────────────

function EditableTemplate({
  title,
  description,
  defaultText,
}: {
  title: string
  description: string
  defaultText: string
}) {
  const [text, setText] = useState(defaultText)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">{description}</p>
          </div>
          <CopyButton getText={() => text} />
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="text-sm leading-relaxed font-sans resize-y"
          rows={10}
        />
      </CardContent>
    </Card>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const REVIEW_DEFAULT = `Hi [Parent Name],

Here's a quick progress update for [Student Name] for [Month]:

Lecture progress: [e.g. Completed Topic 6 — Functions]
Homework progress: [e.g. Up to Topic 5 Q20]
Strengths: [e.g. Good understanding of loops]
Areas to improve: [e.g. Needs more practice on list comprehension]

Overall, [Student Name] is doing [well / making steady progress]. I'll continue to support them in the coming weeks.

Best regards,
Lim Xuan`

const RECOMMENDATION_DEFAULT = `To Whom It May Concern,

I am writing to recommend [Student Name], whom I have had the pleasure of tutoring in [Subject] since [Start Date].

Throughout our sessions, [Student Name] has demonstrated a strong work ethic, intellectual curiosity, and genuine passion for learning. [He/She/They] consistently completes assignments on time, asks thoughtful questions, and shows remarkable improvement with each topic covered.

Academically, [Student Name] has progressed from [Starting Level] to [Current Level], and I am confident in [his/her/their] ability to succeed in a demanding academic environment.

I wholeheartedly recommend [Student Name] for [Programme / Scholarship / Opportunity] and am happy to provide further information if required.

Yours sincerely,
Lim Xuan
Private Tutor — Python & Computer Science
Contact: limxuan520@gmail.com`

export default function TemplatesPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-slate-500 mt-1">Fill in the fields or edit the text, then copy.</p>
      </div>
      <div className="space-y-6">
        <PaymentTemplate />
        <EditableTemplate
          title="Progress Review"
          description="End-of-month update to share with parents."
          defaultText={REVIEW_DEFAULT}
        />
        <EditableTemplate
          title="Recommendation Letter"
          description="Reference letter for university or scholarship applications."
          defaultText={RECOMMENDATION_DEFAULT}
        />
      </div>
    </div>
  )
}
