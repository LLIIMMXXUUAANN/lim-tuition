import { google } from 'googleapis'
import { createClient } from '@/services/supabase/server'

export async function getOAuth2Client() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'google_refresh_token')
    .single()

  if (error || !data) throw new Error('Google not connected. Visit /api/google/auth to connect.')

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
  client.setCredentials({ refresh_token: data.value })
  return client
}

export function newOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}
