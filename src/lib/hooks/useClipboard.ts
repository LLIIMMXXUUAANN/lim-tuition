import { useState } from 'react'

export function useClipboard(resetMs = 2000) {
  const [copied, setCopied] = useState(false)

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), resetMs)
    } catch {
      // clipboard permission denied — silently ignore
    }
  }

  return { copied, copy }
}
