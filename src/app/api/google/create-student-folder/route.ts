import { NextRequest, NextResponse } from 'next/server'
import { requireTutor } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { createStudentDriveFolder } from '@/lib/google/drive'
import type { ClassSlot } from '@/lib/types'

export async function POST(req: NextRequest) {
  const { error } = await requireTutor()
  if (error) return error

  const body = await req.json().catch(() => ({})) as { name?: string; meet_link?: string; class_schedule?: { day: string; start: string; end: string }[] }
  const { name, meet_link, class_schedule } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!meet_link?.trim()) return NextResponse.json({ error: 'meet_link is required' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const folderUrl = await createStudentDriveFolder(auth, name.trim(), meet_link.trim(), (class_schedule ?? []) as ClassSlot[])
    return NextResponse.json({ url: folderUrl })
  } catch (err: unknown) {
    const raw = err instanceof Error ? err.message : 'Failed to create Drive folder'
    const message = raw.toLowerCase().includes('insufficient') || raw.includes('403')
      ? 'Google Drive not authorised. Visit /api/google/auth to re-connect.'
      : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
