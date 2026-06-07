'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/services/supabase/client'
import { Button } from '@/shared/ui/button'

export default function LogoutButton({ redirectTo = '/admin/login', className }: { redirectTo?: string; className?: string }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <Button variant="ghost" onClick={handleLogout} className={className}>
      Sign out
    </Button>
  )
}
