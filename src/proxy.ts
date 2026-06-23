import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic =
    pathname === '/' ||
    pathname === '/admin/login' ||
    pathname === '/student/login' ||
    pathname.startsWith('/auth')

  // Not logged in
  if (!user) {
    if (isPublic) return supabaseResponse
    if (pathname.startsWith('/student')) {
      return NextResponse.redirect(new URL('/student/login', request.url))
    }
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  const { data: isAdmin, error: rpcError } = await supabase.rpc('is_tutor')
  if (rpcError) {
    const loginUrl = pathname.startsWith('/student') ? '/student/login' : '/admin/login'
    return NextResponse.redirect(new URL(loginUrl, request.url))
  }

  // Admin: redirect away from login, allow everything else
  if (isAdmin) {
    if (pathname === '/admin/login') {
      return NextResponse.redirect(new URL('/admin/students', request.url))
    }
    return supabaseResponse
  }

  // Student (non-admin): block admin routes and API, redirect away from student login
  if ((pathname.startsWith('/admin') && pathname !== '/admin/login') || pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/student', request.url))
  }
  if (pathname === '/student/login') {
    return NextResponse.redirect(new URL('/student', request.url))
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
