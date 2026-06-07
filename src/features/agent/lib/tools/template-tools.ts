import type { ClassSlot } from '@/lib/types'
import { buildPaymentMessage } from '@/shared/lib/payment'
import { TEMPLATE_META, templateMeta } from '@/shared/lib/templates'
import type { Supabase } from './shared'

export function listTemplates() {
  return {
    templates: Object.entries(TEMPLATE_META).map(([id, meta]) => ({ id, ...meta })),
  }
}

export async function getTemplate(supabase: Supabase, id: string) {
  const { data, error } = await supabase
    .from('templates')
    .select('id, content')
    .eq('id', id)
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: `Template "${id}" not found` }

  return { template: { id: data.id, ...templateMeta(data.id), content: data.content as string } }
}

export async function generatePaymentMessage(
  supabase: Supabase,
  params: {
    student_id: string
    month?: number
    year?: number
    template_type?: 1 | 2
    carryover?: number
  }
) {
  const myt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
  myt.setMonth(myt.getMonth() + 1)
  const resolvedMonth = params.month ?? (myt.getMonth() + 1)
  const resolvedYear = params.year ?? myt.getFullYear()
  const templateType = params.template_type ?? 1
  const carryover = params.carryover ?? 0

  const { data: student, error } = await supabase
    .from('students')
    .select('name, contact_person, class_schedule, fee_per_hour, status')
    .eq('id', params.student_id)
    .single()

  if (error || !student) return { error: 'Student not found' }
  if (student.status !== 'Active') return { error: 'Student is not active' }

  const result = buildPaymentMessage({
    student: {
      name: student.name,
      contact_person: student.contact_person,
      class_schedule: student.class_schedule as ClassSlot[],
      fee_per_hour: student.fee_per_hour,
    },
    month: resolvedMonth,
    year: resolvedYear,
    templateType,
    carryover,
  })
  if ('error' in result) return { error: result.error }
  return { message: result.message, month: resolvedMonth, year: resolvedYear, monthName: result.monthName }
}
