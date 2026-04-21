import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import StudentPortalView from '@/components/StudentPortalView'
import type { Student } from '@/lib/types'

export default async function PortalPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) redirect('/student/login')

  const { data: student } = await supabase
    .from('students')
    .select('*')
    .contains('access_emails', [user.email])
    .limit(1)
    .maybeSingle()

  if (!student) {
    return (
      <div className="max-w-2xl mx-auto px-6 pt-16 text-center space-y-3">
        <p className="text-lg font-semibold text-slate-700">No student record found</p>
        <p className="text-slate-500 text-sm">Your email is not linked to any student. Please contact your tutor.</p>
      </div>
    )
  }

  return <StudentPortalView student={student as Student} />
}
