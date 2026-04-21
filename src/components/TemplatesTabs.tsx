'use client'

import { useState } from 'react'
import PaymentGenerator from './PaymentGenerator'
import TemplatesList from './TemplatesList'
import TimetableSection from './TimetableSection'
import type { Student, AvailabilitySlot } from '@/lib/types'

type Tab = 'templates' | 'timetable'

interface Props {
  templates: Record<string, string>
  students: Pick<Student, 'id' | 'name' | 'class_schedule' | 'fee_per_hour'>[]
  availability: AvailabilitySlot[]
}

export default function TemplatesTabs({ templates, students, availability }: Props) {
  const [tab, setTab] = useState<Tab>('templates')

  return (
    <div>
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        <button
          onClick={() => setTab('templates')}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
            tab === 'templates'
              ? 'bg-white border border-b-white border-slate-200 -mb-px text-navy'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setTab('timetable')}
          className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
            tab === 'timetable'
              ? 'bg-white border border-b-white border-slate-200 -mb-px text-navy'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Timetable
        </button>
      </div>

      {tab === 'templates' && (
        <div className="space-y-6">
          <PaymentGenerator students={students} />
          <TemplatesList initialData={templates} />
        </div>
      )}

      {tab === 'timetable' && (
        <TimetableSection initialAvailability={availability} students={students} />
      )}
    </div>
  )
}
