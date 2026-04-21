'use client'

import { useState } from 'react'
import TimetableAvailabilityEditor from './TimetableAvailabilityEditor'
import TimetableCanvas from './TimetableCanvas'
import type { AvailabilitySlot, ClassSlot } from '@/lib/types'

interface Props {
  initialAvailability: AvailabilitySlot[]
  students: { name: string; class_schedule: ClassSlot[] }[]
}

export default function TimetableSection({ initialAvailability, students }: Props) {
  const [availability, setAvailability] = useState<AvailabilitySlot[]>(initialAvailability)

  return (
    <div className="border rounded-lg p-6 space-y-6">
      <h2 className="text-lg font-semibold">Timetable Generator</h2>
      <TimetableAvailabilityEditor initialSlots={availability} onSaved={setAvailability} />
      <hr className="border-slate-200" />
      <TimetableCanvas availability={availability} students={students} />
    </div>
  )
}
