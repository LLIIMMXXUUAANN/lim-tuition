'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Result {
  name: string
  found: number
  status: string
}

export default function BackfillEventIdsButton({ count }: { count: number }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<Result[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    setState('loading')
    try {
      const res = await fetch('/api/google/backfill-event-ids')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResults(data.results ?? [])
      setState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-amber-800">
          <span className="font-medium">{count} student{count !== 1 ? 's' : ''}</span> have calendar events but no stored event IDs — reschedule won&apos;t work for them until backfilled.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={state === 'loading' || state === 'done'}
          className="shrink-0 ml-4"
        >
          {state === 'loading' ? 'Running…' : state === 'done' ? '✓ Done' : 'Backfill Event IDs'}
        </Button>
      </div>

      {state === 'error' && <p className="text-xs text-red-600">{errorMsg}</p>}

      {state === 'done' && results.length > 0 && (
        <ul className="text-xs space-y-1">
          {results.map((r) => (
            <li key={r.name} className={r.status === 'updated' ? 'text-green-700' : 'text-slate-500'}>
              <span className="font-medium">{r.name}</span> — {r.status === 'updated' ? `${r.found} event${r.found !== 1 ? 's' : ''} saved` : r.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
