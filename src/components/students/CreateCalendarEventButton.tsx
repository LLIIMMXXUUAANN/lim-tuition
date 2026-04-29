'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ClassSlot {
  day: string
  start: string
  end: string
}

interface Props {
  name: string
  classSchedule: ClassSlot[]
  onSuccess: (meetLink: string) => void
}

export default function CreateCalendarEventButton({ name, classSchedule, onSuccess }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [eventCount, setEventCount] = useState(0)

  async function handleClick() {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/google/create-class-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, class_schedule: classSchedule }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSuccess(data.meetLink)
      setEventCount(data.eventCount)
      setState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create calendar event')
      setState('error')
    }
  }

  const disabled = !name.trim() || classSchedule.length === 0 || state === 'loading' || state === 'done'

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={disabled}
      >
        {state === 'loading'
          ? 'Creating…'
          : state === 'done'
          ? `✓ ${eventCount} event${eventCount !== 1 ? 's' : ''} created`
          : 'Create Google Calendar Event'}
      </Button>
      {state === 'error' && <span className="text-xs text-red-500">{errorMsg}</span>}
    </div>
  )
}
