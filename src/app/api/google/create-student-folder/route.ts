import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOAuth2Client } from '@/lib/google/auth'
import { createStudentDriveFolder } from '@/lib/google/drive'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: isTutor } = await supabase.rpc('is_tutor')
  if (!isTutor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { name?: string }
  const { name } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  try {
    const auth = await getOAuth2Client()
    const folderUrl = await createStudentDriveFolder(auth, name.trim())
    return NextResponse.json({ url: folderUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create Drive folder'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
