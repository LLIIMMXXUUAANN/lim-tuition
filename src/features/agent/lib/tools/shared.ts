import { createClient } from '@/services/supabase/server'

export type Supabase = Awaited<ReturnType<typeof createClient>>

export function errMsg(err: unknown, fallback = 'Unknown error') {
  return err instanceof Error ? err.message : fallback
}
