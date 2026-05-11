'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Result {
  name: string
  status: 'synced' | 'skipped' | 'error'
  reason?: string
}

export default function SyncAllButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [results, setResults] = useState<Result[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    setState('loading')
    setResults([])
    setErrorMsg('')
    try {
      const res = await fetch('/api/google/sync-all', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResults(data.results ?? [])
      setState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  const needsReconnect = results.some(r => r.reason?.includes('reconnect'))
  const syncedCount = results.filter(r => r.status === 'synced').length

  const label =
    state === 'idle' ? 'Sync all active students’ Google Calendar events and Drive Meet docs to match the DB schedule.'
    : state === 'loading' ? 'Syncing Google Calendar and Drive…'
    : `Done — ${syncedCount} of ${results.length} synced.`

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-softBg px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">{label}</p>
        {state === 'idle' && (
          <Button variant="outline" size="sm" onClick={handleClick} className="shrink-0">
            Sync Google
          </Button>
        )}
        {(state === 'done' || state === 'error') && (
          <Button variant="outline" size="sm" onClick={() => setState('idle')} className="shrink-0">
            Dismiss
          </Button>
        )}
      </div>

      {state === 'error' && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}

      {needsReconnect && (
        <p className="mt-2 text-xs text-red-600">
          Google auth expired.{' '}
          <a href="/api/google/auth" className="underline font-medium">Click here to reconnect</a>
          , then try again.
        </p>
      )}

      {state === 'done' && results.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-navy/15 pt-3">
          {results.map((r) => (
            <li key={r.name} className="flex items-start gap-2 text-xs">
              <span className={
                r.status === 'synced' ? 'text-green-600' :
                r.status === 'error' ? 'text-red-500' : 'text-slate-400'
              }>
                {r.status === 'synced' ? '✓' : r.status === 'error' ? '✗' : '–'}
              </span>
              <span className="font-medium text-slate-700">{r.name}</span>
              {r.reason && <span className="text-slate-400">{r.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
