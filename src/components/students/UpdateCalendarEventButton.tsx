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
  eventIds: string[]
  meetLink: string
  onSuccess: (eventIds: string[]) => void
}

export default function UpdateCalendarEventButton({ name, classSchedule, eventIds, meetLink, onSuccess }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/google/update-class-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          class_schedule: classSchedule,
          event_ids: eventIds,
          meet_link: meetLink,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSuccess(data.eventIds)
      setState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update calendar events')
      setState('error')
    }
  }

  const disabled = !name.trim() || classSchedule.length === 0 || !meetLink.trim() || state === 'loading' || state === 'done'

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
          ? 'Updating…'
          : state === 'done'
          ? '✓ Calendar updated'
          : 'Update Calendar Events'}
      </Button>
      {state === 'error' && <span className="text-xs text-red-500">{errorMsg}</span>}
    </div>
  )
}
