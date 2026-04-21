'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
      <p className="text-sm text-slate-600">
        Check your inbox for a login link.
      </p>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <Input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Sending...' : 'Send login link'}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Admin Portal</CardTitle>
            <CardDescription>Sign in to manage your students</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm text-slate-500">Loading...</p>}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-slate-500">
          Not the admin?{' '}
          <a href="/" className="text-slate-700 underline underline-offset-4 hover:text-slate-900">
            Back to landing page
          </a>
        </p>
      </div>
    </div>
  )
}
