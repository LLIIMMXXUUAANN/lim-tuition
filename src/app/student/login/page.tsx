'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/services/supabase/client'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

export default function StudentLoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.BaseSyntheticEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const normalised = email.trim().toLowerCase()
    const supabase = createClient()

    const { data: hasAccess, error: rpcError } = await supabase.rpc('check_portal_access', { p_email: normalised })
    if (rpcError || !hasAccess) {
      setError('No access. Your email is not registered. Please contact your tutor.')
      setLoading(false)
      return
    }

    const origin = window.location.origin
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalised,
      options: { emailRedirectTo: `${origin}/auth/callback?next=/student` },
    })
    if (otpError) {
      setError('Failed to send login link. Please try again.')
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-softBg">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 max-w-sm w-full text-center space-y-4">
          <h1 className="text-2xl font-semibold">Check your inbox</h1>
          <p className="text-slate-600">A login link has been sent to your email.</p>
          <Link href="/" className="text-sm text-accentGold hover:underline block">
            ← Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-softBg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 max-w-sm w-full space-y-6">
        <div className="text-center space-y-1">
          <span className="text-2xl font-bold text-navy">&lt;/&gt;</span>
          <h1 className="text-xl font-semibold mt-1">Student Portal</h1>
          <p className="text-slate-500 text-sm">Sign in to view your schedule and progress</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Checking...' : 'Send Login Link'}</Button>
        </form>
        <Link href="/" className="text-sm text-accentGold/80 hover:text-accentGold hover:underline block text-center">
          ← Back to home
        </Link>
      </div>
    </div>
  )
}
