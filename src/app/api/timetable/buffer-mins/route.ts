import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'timetable_buffer_mins')
    .single()

  return NextResponse.json({ bufferMins: data ? parseInt(data.value, 10) : 15 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { bufferMins?: number }
  if (typeof body.bufferMins !== 'number' || body.bufferMins < 0 || body.bufferMins > 60) {
    return NextResponse.json({ error: 'bufferMins must be a number between 0 and 60' }, { status: 400 })
  }

  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_buffer_mins', value: String(body.bufferMins) }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
