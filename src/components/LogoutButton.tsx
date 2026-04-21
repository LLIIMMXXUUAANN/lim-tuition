'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

export default function LogoutButton({ redirectTo = '/admin/login' }: { redirectTo?: string }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <Button variant="ghost" onClick={handleLogout}>
      Sign out
    </Button>
  )
}
