export type StudentMode = 'University' | 'IGCSE' | 'My Python Syllabus'
export type PaymentMethod = 'Monthly' | 'Per Class'

export interface Student {
  id: string
  name: string
  contact_person: string | null
  mode: StudentMode
  weekly_class_time: string | null
  google_meet_link: string | null
  fee_per_hour: number
  payment_method: PaymentMethod
  latest_payment: string | null
  previous_class: string | null
  today_homework: string | null
  lecture_progress: string | null
  homework_progress: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type StudentInsert = Omit<Student, 'id' | 'created_at' | 'updated_at'>
export type StudentUpdate = Partial<StudentInsert>
