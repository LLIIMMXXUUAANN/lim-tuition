'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function LoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(
    searchParams.get('error') === 'invalid_link' ? 'Login link expired or invalid. Request a new one.' : ''
  )

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()

    const { data: isTutor, error: rpcError } = await supabase.rpc('check_tutor_access', { p_email: email.trim().toLowerCase() })
    if (rpcError || !isTutor) {
      setError('No access.')
      setLoading(false)
      return
    }

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (otpError) {
      setError('Failed to send login link. Try again.')
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="text-slate-600">A login link has been sent to your email.</p>
        <Link href="/" className="text-sm text-accentGold hover:underline block">
          ← Back to home
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="text-center space-y-1">
        <span className="text-2xl font-bold text-navy">&lt;/&gt;</span>
        <h1 className="text-xl font-semibold mt-1">Admin Portal</h1>
        <p className="text-slate-500 text-sm">Sign in to manage your students</p>
      </div>
      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending...' : 'Send Login Link'}
        </Button>
      </form>
      <Link href="/" className="text-sm text-accentGold/80 hover:text-accentGold hover:underline block text-center">
        ← Back to home
      </Link>
    </>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-softBg">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 max-w-sm w-full space-y-6">
        <Suspense fallback={<p className="text-sm text-slate-500 text-center">Loading...</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  )
}
