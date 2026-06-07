import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'
import { runSlotGeneration, type BookedSlot } from '@/features/timetable/lib/timetable-slots'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as {
    rules?: string
    studentAvailability?: string
    bookedSlots?: BookedSlot[]
    bufferMins?: number
  }

  if (!body.rules?.trim()) {
    return NextResponse.json({ error: 'rules is required' }, { status: 400 })
  }

  const bookedSlots = body.bookedSlots ?? []
  const bufferMins = typeof body.bufferMins === 'number' ? body.bufferMins : 15

  try {
    const slots = await runSlotGeneration(
      body.rules.trim(),
      body.studentAvailability?.trim() ?? '',
      bookedSlots,
      bufferMins,
    )
    return NextResponse.json({ slots })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gemini API error'
    console.error('[generate-slots]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
