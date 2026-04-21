'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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

const PAYMENT_DEFAULT = `Hi XXX, just a gentle reminder regarding the tuition fee. There are XXX sessions in XXX (XXX, XXX, XXX, XXX, and XXX), bringing the total to RMXXX. Thank you 😃`

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
        <EditableTemplate
          title="Payment Request"
          description="Monthly fee reminder to send to parents."
          defaultText={PAYMENT_DEFAULT}
        />
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
