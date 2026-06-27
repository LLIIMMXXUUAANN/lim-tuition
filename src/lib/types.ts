export type StudentMode = 'My Python Syllabus' | 'Other Syllabus'
export type PaymentMethod = 'Monthly' | 'Weekly'
export type StudentStatus = 'Active' | 'On Hold' | 'Completed'
export type WeekDay = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'

export interface ClassSlot {
  day: WeekDay
  start: string // "14:30"
  end: string   // "16:30"
}

export interface Student {
  id: string
  accessEmails: string[] | null
  name: string
  contactPerson: string | null
  contactPhone: string | null
  studentPhone: string | null
  mode: StudentMode
  classSchedule: ClassSlot[]
  googleMeetLink: string | null
  googleDriveLink: string | null
  calendarEventIds: string[] | null
  feePerHour: number
  paymentMethod: PaymentMethod
  latestPayment: string | null
  todayHomework: string | null
  notes: string | null
  status: StudentStatus
  createdAt: string
  updatedAt: string
}

export type StudentInsert = Omit<Student, 'id' | 'createdAt' | 'updatedAt' | 'googleMeetLink' | 'googleDriveLink' | 'calendarEventIds'>
export type StudentUpdate = Partial<StudentInsert>
