import type { Supabase } from '@/lib/agent/tools'

export async function selfEval(
  toolName: string,
  args: Record<string, unknown>,
  supabase: Supabase,
  createdId?: string
): Promise<string> {
  try {
    if (toolName === 'create_student' || toolName === 'update_student') {
      const id = toolName === 'create_student' ? createdId : (args.id as string)
      if (!id) return '⚠ could not verify'
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('id', id)
        .maybeSingle()
      return data ? '✓ verified in DB' : '⚠ could not verify'
    }
    if (toolName === 'delete_student') {
      const { data } = await supabase
        .from('students')
        .select('id')
        .eq('id', args.id as string)
        .maybeSingle()
      return !data ? '✓ verified deleted' : '_⚠ student still exists in DB_'
    }
    if (toolName === 'setup_student_google') {
      const { data } = await supabase
        .from('students')
        .select('google_meet_link, google_drive_link')
        .eq('id', args.student_id as string)
        .maybeSingle()
      if (!data) return '⚠ could not verify'
      const parts = [
        data.google_meet_link ? '✓ Meet link set' : '⚠ Meet link missing',
        data.google_drive_link ? '✓ Drive folder set' : '⚠ Drive folder missing',
      ]
      return parts.join(', ')
    }
  } catch {
    return '⚠ could not verify'
  }
  return ''
}
