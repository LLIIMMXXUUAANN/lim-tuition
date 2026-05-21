import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { stopSignals, requestAbortControllers } from '@/lib/agent/stop-signals'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error
  const { requestId } = await req.json().catch(() => ({})) as { requestId?: string }
  if (requestId) {
    stopSignals.set(requestId, true)
    requestAbortControllers.get(requestId)?.abort()
  }
  return NextResponse.json({ ok: true })
}
