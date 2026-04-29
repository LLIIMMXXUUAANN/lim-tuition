'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  name: string
  onSuccess: (url: string) => void
}

export default function CreateDriveFolderButton({ name, onSuccess }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleClick() {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/google/create-student-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      onSuccess(data.url)
      setState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create folder')
      setState('error')
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={!name.trim() || state === 'loading' || state === 'done'}
      >
        {state === 'loading' ? 'Creating…' : state === 'done' ? '✓ Folder created' : 'Create Google Drive Folder (Python Syllabus)'}
      </Button>
      {!name.trim() && state === 'idle' && <span className="text-xs text-slate-400">Requires student name</span>}
      {state === 'error' && <span className="text-xs text-red-500">{errorMsg}</span>}
    </div>
  )
}
