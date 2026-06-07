import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/services/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'timetable_rules')
    .single()

  return NextResponse.json({ rules: data?.value ?? '' })
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { rules?: string }
  if (typeof body.rules !== 'string') {
    return NextResponse.json({ error: 'rules must be a string' }, { status: 400 })
  }

  const { error: upsertErr } = await supabase
    .from('settings')
    .upsert({ key: 'timetable_rules', value: body.rules }, { onConflict: 'key' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
