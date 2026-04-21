import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import StudentDetail from '@/components/StudentDetail'
import type { Student } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('students').select('*').eq('id', id).single()

  if (!data) notFound()

  return <StudentDetail student={data as Student} />
}
