import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildPaymentMessage } from '@/lib/payment'
import type { ClassSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RequestBody {
  studentId: string
  month: number
  year: number
  templateType: 1 | 2
  carryover?: number
}

export async function POST(request: NextRequest) {
  let body: RequestBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { studentId, month, year, templateType, carryover } = body

  if (!studentId || !month || !year || ![1, 2].includes(templateType)) {
    return Response.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  if (month < 1 || month > 12 || year < 2020 || year > 2100) {
    return Response.json({ error: 'month or year out of range' }, { status: 400 })
  }

  if (templateType === 2 && (carryover === undefined || carryover < 0)) {
    return Response.json({ error: 'carryover is required for templateType 2' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: student, error } = await supabase
    .from('students')
    .select('name, contact_person, class_schedule, fee_per_hour, status')
    .eq('id', studentId)
    .single()

  if (error || !student) {
    return Response.json({ error: 'Student not found' }, { status: 404 })
  }

  if (student.status !== 'Active') {
    return Response.json({ error: 'Student is not active' }, { status: 400 })
  }

  const result = buildPaymentMessage({
    student: {
      name: student.name,
      contact_person: student.contact_person,
      class_schedule: student.class_schedule as ClassSlot[],
      fee_per_hour: student.fee_per_hour,
    },
    month,
    year,
    templateType,
    carryover,
  })

  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 })
  }

  return Response.json({ message: result.message })
}
