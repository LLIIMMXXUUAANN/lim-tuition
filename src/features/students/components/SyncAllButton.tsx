'use client'

import { useMutation } from '@tanstack/react-query'
import { Button } from '@/shared/ui/button'
import { HttpError, parseRetryAfterMs } from '@/shared/lib/httpError'

interface Result {
  name: string
  status: 'synced' | 'skipped' | 'error'
  reason?: string
}

export default function SyncAllButton() {
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/google/sync-all', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new HttpError(data.error ?? 'Failed', res.status, parseRetryAfterMs(res))
      return (data.results ?? []) as Result[]
    },
  })

  const results = syncMutation.data ?? []
  const errorMsg =
    syncMutation.error instanceof HttpError
      ? syncMutation.error.message
      : syncMutation.error
        ? 'Unknown error'
        : ''

  const needsReconnect = results.some(r => r.reason?.includes('reconnect'))
  const syncedCount = results.filter(r => r.status === 'synced').length

  const label =
    syncMutation.isIdle ? 'Sync all active students’ Google Calendar events and Drive Meet docs to match the DB schedule.'
    : syncMutation.isPending ? 'Syncing Google Calendar and Drive…'
    : syncMutation.isSuccess ? `Done — ${syncedCount} of ${results.length} synced.`
    : ''

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-softBg px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-600">{label}</p>
        {syncMutation.isIdle && (
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} className="shrink-0">
            Sync Google
          </Button>
        )}
        {(syncMutation.isSuccess || syncMutation.isError) && (
          <Button variant="outline" size="sm" onClick={() => syncMutation.reset()} className="shrink-0">
            Dismiss
          </Button>
        )}
      </div>

      {syncMutation.isError && <p className="mt-2 text-xs text-red-600">{errorMsg}</p>}

      {needsReconnect && (
        <p className="mt-2 text-xs text-red-600">
          Google auth expired.{' '}
          <a href="/api/google/auth" className="underline font-medium">Click here to reconnect</a>
          , then try again.
        </p>
      )}

      {syncMutation.isSuccess && results.length > 0 && (
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
