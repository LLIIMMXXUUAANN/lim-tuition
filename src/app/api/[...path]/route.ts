import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

const FASTAPI = process.env.FASTAPI_BASE_URL ?? 'http://127.0.0.1:8000'
const SECRET = process.env.INTERNAL_API_SECRET ?? ''

export const dynamic = 'force-dynamic'

async function proxy(req: NextRequest, segments: string[]): Promise<Response> {
  const path = segments.join('/')

  const { error } = await requireTutor()
  if (error) return error

  // Build upstream URL, preserving query string
  const upstreamUrl = new URL(`${FASTAPI}/${path}`)
  req.nextUrl.searchParams.forEach((value, key) => upstreamUrl.searchParams.set(key, value))

  const headers: Record<string, string> = { 'X-Internal-Secret': SECRET }
  const contentType = req.headers.get('content-type')
  if (contentType) headers['Content-Type'] = contentType

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  let upstream: globalThis.Response
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-ignore — Node 18 fetch requires duplex for streaming request bodies
      duplex: 'half',
      redirect: 'manual', // pass redirects through to the client (e.g. Google OAuth)
    })
  } catch {
    return NextResponse.json({ error: 'Backend unavailable' }, { status: 502 })
  }

  const responseHeaders = new Headers(upstream.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('content-length')

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, path)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, path)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxy(req, path)
}
