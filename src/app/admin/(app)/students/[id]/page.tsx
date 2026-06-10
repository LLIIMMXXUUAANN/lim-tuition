import { notFound } from 'next/navigation'
import { fetchFastAPI } from '@/lib/fastapi'
import StudentDetail from '@/features/students/components/StudentDetail'
import type { Student } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function StudentDetailPage({ params }: Props) {
  const { id } = await params
  const res = await fetchFastAPI(`/students/${id}`)
  if (!res.ok) notFound()
  const data: Student = await res.json()

  return <StudentDetail student={data} />
}
