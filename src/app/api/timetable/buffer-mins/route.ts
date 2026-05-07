import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'timetable_buffer_mins')
    .single()

  return NextResponse.json({ bufferMins: data ? parseInt(data.value, 10) : 15 })
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { bufferMins?: number }
  if (typeof body.bufferMins !== 'number' || body.bufferMins < 0 || body.bufferMins > 60) {
    return NextResponse.json({ error: 'bufferMins must be a number between 0 and 60' }, { status: 400 })
  }

  const { error: upsertErr } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_buffer_mins', value: String(body.bufferMins) }, { onConflict: 'key' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
