import { createCanvas } from '@napi-rs/canvas'
import { requireTutor } from '@/services/supabase/server'
import type { ClassSlot } from '@/lib/types'
import { PNG_W, SCALE, scheduleCanvasHeight, drawScheduleToCtx } from '@/shared/lib/timetable-canvas'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const { data, error: dbErr } = await supabase
    .from('students')
    .select('name, class_schedule')
    .eq('status', 'Active')
    .order('name')

  if (dbErr) return new Response('DB error', { status: 500 })

  const students = (data ?? []).map(s => ({
    name: s.name as string,
    class_schedule: (s.class_schedule as ClassSlot[]) ?? [],
  }))

  const sch_h = scheduleCanvasHeight(students)
  const canvas = createCanvas(PNG_W * SCALE, sch_h * SCALE)
  const ctx = canvas.getContext('2d')
  ctx.scale(SCALE, SCALE)
  drawScheduleToCtx(ctx, students)

  const buffer = await canvas.encode('png')

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="weekly_schedule.png"',
      'Cache-Control': 'no-store',
    },
  })
}
