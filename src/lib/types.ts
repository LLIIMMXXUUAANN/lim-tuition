export type StudentMode = 'University' | 'IGCSE' | 'My Python Syllabus'
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
  name: string
  contact_person: string | null
  contact_phone: string | null
  student_phone: string | null
  mode: StudentMode
  class_schedule: ClassSlot[]
  google_meet_link: string | null
  google_drive_link: string | null
  fee_per_hour: number
  payment_method: PaymentMethod
  latest_payment: string | null
  today_homework: string | null
  notes: string | null
  status: StudentStatus
  is_active: boolean
  created_at: string
  updated_at: string
}

export type StudentInsert = Omit<Student, 'id' | 'created_at' | 'updated_at'>
export type StudentUpdate = Partial<StudentInsert>
