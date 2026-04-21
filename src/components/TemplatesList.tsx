'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

const TEMPLATE_ROWS: Record<string, number> = {
  payment: 3,
  payment2: 3,
  review_request1: 5,
  review_request2: 5,
  recommendation_request1: 5,
  recommendation_request2: 6,
}

const TEMPLATE_META: { id: string; title: string; description: string }[] = [
  { id: 'payment', title: 'Payment Request 1', description: 'Monthly fee reminder (standard).' },
  { id: 'payment2', title: 'Payment Request 2', description: 'Monthly fee reminder with carried-over sessions.' },
  { id: 'review_request1', title: 'Review Request 1', description: 'For students tutored directly.' },
  { id: 'review_request2', title: 'Review Request 2', description: 'For students tutored through a parent.' },
  { id: 'recommendation_request1', title: 'Recommendation Request 1', description: 'For students tutored directly.' },
  { id: 'recommendation_request2', title: 'Recommendation Request 2', description: 'For students tutored through a parent.' },
]

function TemplateCard({
  id,
  title,
  description,
  initialContent,
}: {
  id: string
  title: string
  description: string
  initialContent: string
}) {
  const [saved, setSaved] = useState(initialContent)
  const [content, setContent] = useState(initialContent)
  const [editing, setEditing] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [copied, setCopied] = useState(false)

  async function handleSave() {
    setSaveState('saving')
    const supabase = createClient()
    const { error } = await supabase.from('templates').upsert({ id, content })
    if (error) {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
      return
    }
    setSaved(content)
    setSaveState('saved')
    setEditing(false)
    setTimeout(() => setSaveState('idle'), 2000)
  }

  function handleCancel() {
    setContent(saved)
    setEditing(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="text-sm text-slate-500 mt-0.5">{description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saveState === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
            {saveState === 'saved' && <span className="text-xs text-green-600">Saved</span>}
            {saveState === 'error' && <span className="text-xs text-red-500">Save failed</span>}
            {editing ? (
              <>
                <Button size="sm" variant="outline" onClick={handleCancel}>Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saveState === 'saving'}>Save</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
                <Button size="sm" variant={copied ? 'outline' : 'default'} onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {editing ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="text-sm leading-relaxed font-sans resize-y"
            rows={TEMPLATE_ROWS[id] ?? 5}
            autoFocus
          />
        ) : (
          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{content}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function TemplatesList({ initialData }: { initialData: Record<string, string> }) {
  return (
    <div className="space-y-6">
      {TEMPLATE_META.map(({ id, title, description }) => (
        <TemplateCard
          key={id}
          id={id}
          title={title}
          description={description}
          initialContent={initialData[id] ?? ''}
        />
      ))}
    </div>
  )
}
