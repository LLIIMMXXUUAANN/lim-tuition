import type { ClassSlot } from '@/lib/types'
import { timeToMins, MONTH_NAMES, getWeekdayDates, formatFee, ordinal, oxfordList, groupSlotsByDay } from '@/lib/utils'

export interface PaymentStudentData {
  name: string
  contact_person: string | null
  class_schedule: ClassSlot[]
  fee_per_hour: number
}

export interface BuildPaymentParams {
  student: PaymentStudentData
  month: number
  year: number
  templateType: 1 | 2
  carryover?: number
}

export type BuildPaymentResult =
  | { message: string; monthName: string; sessionCount: number; error?: never }
  | { error: string; message?: never }

export function buildPaymentMessage(params: BuildPaymentParams): BuildPaymentResult {
  const { student, month, year, templateType, carryover = 0 } = params
  const slotsByDay = groupSlotsByDay(student.class_schedule)

  const allDates: number[] = []
  let sessionFeeTotal = 0
  for (const [day, slots] of slotsByDay) {
    const dates = getWeekdayDates(year, month, day)
    allDates.push(...dates)
    const hoursPerSession = slots.reduce(
      (sum, s) => sum + (timeToMins(s.end) - timeToMins(s.start)) / 60,
      0,
    )
    sessionFeeTotal += dates.length * hoursPerSession * student.fee_per_hour
  }
  allDates.sort((a, b) => a - b)

  if (allDates.length === 0) return { error: 'No scheduled class days found for this student' }

  const sessionCount = allDates.length
  const monthName = MONTH_NAMES[month - 1]
  const dateList = oxfordList(allDates.map(ordinal))
  const cp = student.contact_person?.trim()
  const recipient = (!cp || cp === '-') ? student.name : cp

  const message = templateType === 1
    ? `Hi ${recipient}, just a gentle reminder regarding the tuition fee. There are ${sessionCount} sessions in ${monthName} (${dateList}), bringing the total to RM${formatFee(sessionFeeTotal)}. Thank you 😄`
    : (() => {
        const coFee = carryover * (sessionFeeTotal / sessionCount)
        const coLabel = `${carryover} session${carryover === 1 ? '' : 's'}`
        return `Hi ${recipient}, just a gentle reminder regarding the tuition fee. There are ${sessionCount} sessions in ${monthName} (${dateList}). With ${coLabel} carried over from the previous classes, bringing the total to RM${formatFee(sessionFeeTotal - coFee)}. Thank you. 😄`
      })()

  return { message, monthName, sessionCount }
}
