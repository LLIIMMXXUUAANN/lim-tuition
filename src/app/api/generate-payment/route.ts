import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { timeToMins, MONTH_NAMES, DAY_INDEX } from '@/lib/utils'
import type { ClassSlot } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RequestBody {
  studentId: string
  month: number
  year: number
  templateType: 1 | 2
  carryover?: number
}


function getWeekdayDates(year: number, month: number, weekday: string): number[] {
  const dayIndex = DAY_INDEX[weekday]
  if (dayIndex === undefined) return []
  const dates: number[] = []
  const d = new Date(year, month - 1, 1)
  while (d.getDay() !== dayIndex) d.setDate(d.getDate() + 1)
  while (d.getMonth() === month - 1) {
    dates.push(d.getDate())
    d.setDate(d.getDate() + 7)
  }
  return dates
}


function formatFee(fee: number): string {
  const rounded = Math.round(fee * 100) / 100
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2)
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

function oxfordList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
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

  const schedule = (student.class_schedule as ClassSlot[]) ?? []

  // Group slots by day to avoid duplicate dates
  const slotsByDay = new Map<string, ClassSlot[]>()
  for (const slot of schedule) {
    const existing = slotsByDay.get(slot.day) ?? []
    slotsByDay.set(slot.day, [...existing, slot])
  }

  const allDates: number[] = []
  let sessionFeeTotal = 0

  for (const [day, slots] of slotsByDay) {
    const dates = getWeekdayDates(year, month, day)
    allDates.push(...dates)
    const hoursPerSession = slots.reduce((sum, s) => sum + (timeToMins(s.end) - timeToMins(s.start)) / 60, 0)
    sessionFeeTotal += dates.length * hoursPerSession * student.fee_per_hour
  }

  allDates.sort((a, b) => a - b)

  if (allDates.length === 0) {
    return Response.json({ error: 'No scheduled class days found for this student' }, { status: 400 })
  }

  const dateList = oxfordList(allDates.map(ordinal))
  const monthName = MONTH_NAMES[month - 1]
  const cp = student.contact_person?.trim()
  const recipient = (!cp || cp === '-') ? student.name : cp
  const sessionCount = allDates.length

  let message: string
  if (templateType === 1) {
    message = `Hi ${recipient}, just a gentle reminder regarding the tuition fee. There are ${sessionCount} sessions in ${monthName} (${dateList}), bringing the total to RM${formatFee(sessionFeeTotal)}. Thank you 😄`
  } else {
    const co = carryover ?? 0
    const coFee = co * (sessionFeeTotal / sessionCount)
    const total = sessionFeeTotal - coFee
    const coLabel = `${co} session${co === 1 ? '' : 's'}`
    message = `Hi ${recipient}, just a gentle reminder regarding the tuition fee. There are ${sessionCount} sessions in ${monthName} (${dateList}). With ${coLabel} carried over from the previous classes, bringing the total to RM${formatFee(total)}. Thank you. 😄`
  }

  return Response.json({ message })
}
