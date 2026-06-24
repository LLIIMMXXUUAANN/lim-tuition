import { createClient } from '@/services/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const raw = searchParams.get('next') ?? ''
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/admin/students'
  const errorRedirect = next.startsWith('/student') ? '/student/login' : '/admin/login'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}${errorRedirect}?error=invalid_link`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}${errorRedirect}?error=invalid_link`)
}
