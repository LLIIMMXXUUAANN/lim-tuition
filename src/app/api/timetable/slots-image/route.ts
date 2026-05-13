import { NextRequest } from 'next/server'
import { createCanvas } from '@napi-rs/canvas'
import { requireTutor } from '@/lib/supabase/server'
import type { ClassSlot } from '@/lib/types'
import { PNG_W, PNG_H, SCALE, cellKey, drawSlotsToCtx, type SlotType } from '@/lib/timetable-canvas'
import { buildBookedCellSet, type ClassifiedSlot } from '@/lib/timetable-slots'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { slots?: ClassifiedSlot[] }
  if (!Array.isArray(body.slots)) {
    return new Response('slots is required', { status: 400 })
  }

  const { data } = await supabase
    .from('students')
    .select('class_schedule')
    .eq('status', 'Active')

  const bookedSlots = (data ?? []).flatMap(s =>
    ((s.class_schedule as ClassSlot[]) ?? []).map(slot => ({
      day: slot.day,
      start: slot.start,
      end: slot.end,
    }))
  )
  const bookedSet = buildBookedCellSet(bookedSlots)

  const grid = new Map<string, SlotType>()
  for (const s of body.slots) {
    if (s.state === 'preferred' || s.state === 'normal') {
      grid.set(cellKey(s.day, s.time), s.state)
    }
  }

  const canvas = createCanvas(PNG_W * SCALE, PNG_H * SCALE)
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  drawSlotsToCtx(ctx, grid, bookedSet)

  const buffer = await canvas.encode('png')

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="slot_availability.png"',
      'Cache-Control': 'no-store',
    },
  })
}
