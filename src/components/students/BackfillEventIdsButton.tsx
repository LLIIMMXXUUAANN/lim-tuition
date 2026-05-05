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
    <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-800">{count} {count !== 1 ? 'students' : 'student'}</span>
          {' '}missing calendar event IDs — sync them so rescheduling works.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={state === 'loading' || state === 'done'}
          className="shrink-0"
        >
          {state === 'loading' ? 'Syncing…' : state === 'done' ? '✓ Done' : 'Sync Event IDs'}
        </Button>
      </div>

      {state === 'error' && (
        <p className="mt-2 text-xs text-red-600">{errorMsg}</p>
      )}

      {state === 'done' && results.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-slate-200 pt-3">
          {results.map((r) => (
            <li key={r.name} className="flex items-center gap-2 text-xs">
              <span className={r.status === 'updated' ? 'text-green-600' : 'text-slate-400'}>
                {r.status === 'updated' ? '✓' : '–'}
              </span>
              <span className="font-medium text-slate-700">{r.name}</span>
              <span className="text-slate-400">
                {r.status === 'updated' ? `${r.found} event${r.found !== 1 ? 's' : ''} synced` : r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
