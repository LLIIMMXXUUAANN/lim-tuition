import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ADMIN_EMAIL = 'limxuan520@gmail.com'

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
    pathname === '/login' ||
    pathname === '/portal/login' ||
    pathname.startsWith('/auth')

  // Not logged in
  if (!user) {
    if (isPublic) return supabaseResponse
    if (pathname.startsWith('/portal')) {
      return NextResponse.redirect(new URL('/portal/login', request.url))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const isAdmin = user.email === ADMIN_EMAIL

  // Admin: redirect away from login, allow everything else
  if (isAdmin) {
    if (pathname === '/login') {
      return NextResponse.redirect(new URL('/students', request.url))
    }
    return supabaseResponse
  }

  // Student (non-admin): block admin routes, redirect away from both login pages
  if (pathname.startsWith('/students') || pathname.startsWith('/templates')) {
    return NextResponse.redirect(new URL('/portal', request.url))
  }
  if (pathname === '/login' || pathname === '/portal/login') {
    return NextResponse.redirect(new URL('/portal', request.url))
  }
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
