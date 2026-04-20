'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Template {
  id: string
  title: string
  description: string
  text: string
}

const TEMPLATES: Template[] = [
  {
    id: 'payment',
    title: 'Payment Request',
    description: 'Monthly payment reminder to send to parents.',
    text: `Hi [Parent Name],

Hope you're doing well! Just a friendly reminder that the tuition fee for [Month] is due.

Amount: RM[Amount]
Payment method: [Bank / TNG / etc.]

Please let me know once payment is done. Thank you!

Best regards,
Lim Xuan`,
  },
  {
    id: 'review',
    title: 'Progress Review',
    description: 'End-of-month progress update to share with parents.',
    text: `Hi [Parent Name],

Here's a quick progress update for [Student Name] for [Month]:

Lecture progress: [e.g. Completed Topic 6 — Functions]
Homework progress: [e.g. Up to Topic 5 Q20]
Strengths: [e.g. Good understanding of loops]
Areas to improve: [e.g. Needs more practice on list comprehension]

Overall, [Student Name] is doing [well / making steady progress / putting in good effort]. I'll continue to support them in the coming weeks.

Feel free to reach out if you have any questions!

Best regards,
Lim Xuan`,
  },
  {
    id: 'recommendation',
    title: 'Recommendation Letter',
    description: 'Reference letter for university or scholarship applications.',
    text: `To Whom It May Concern,

I am writing to recommend [Student Name], whom I have had the pleasure of tutoring in [Subject] since [Start Date].

Throughout our sessions, [Student Name] has demonstrated a strong work ethic, intellectual curiosity, and genuine passion for learning. [He/She/They] consistently completes assignments on time, asks thoughtful questions, and shows remarkable improvement with each topic covered.

Academically, [Student Name] has progressed from [Starting Level] to [Current Level], and I am confident in [his/her/their] ability to succeed in a demanding academic environment.

I wholeheartedly recommend [Student Name] for [Programme / Scholarship / Opportunity] and am happy to provide further information if required.

Yours sincerely,
Lim Xuan
Private Tutor — Python & Computer Science
Contact: limxuan520@gmail.com`,
  },
]

function TemplateCard({ template }: { template: Template }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(template.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{template.title}</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">{template.description}</p>
          </div>
          <Button
            size="sm"
            variant={copied ? 'outline' : 'default'}
            onClick={handleCopy}
            className="shrink-0"
          >
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 rounded-md p-4 border leading-relaxed font-sans">
          {template.text}
        </pre>
      </CardContent>
    </Card>
  )
}

export default function TemplatesPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-slate-500 mt-1">
          Ready-to-use message templates. Click Copy, then paste and fill in the brackets.
        </p>
      </div>
      <div className="space-y-6">
        {TEMPLATES.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  )
}
