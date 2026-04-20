import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import StudentCard from '@/components/StudentCard'
import type { Student, StudentStatus, WeekDay } from '@/lib/types'

const DAYS: WeekDay[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const TABS: { label: string; value: StudentStatus | 'All' }[] = [
  { label: 'All', value: 'All' },
  { label: '🟢 Active', value: 'Active' },
  { label: '🟡 On Hold', value: 'On Hold' },
  { label: '⚫ Completed', value: 'Completed' },
]

interface Props {
  searchParams: Promise<{ status?: string }>
}

export default async function StudentsPage({ searchParams }: Props) {
  const { status } = await searchParams
  const VALID_STATUSES: (StudentStatus | 'All')[] = ['All', 'Active', 'On Hold', 'Completed']
  const activeTab: StudentStatus | 'All' = VALID_STATUSES.includes(status as StudentStatus | 'All')
    ? (status as StudentStatus | 'All')
    : 'Active'

  const supabase = await createClient()
  let query = supabase.from('students').select('*').order('name')
  if (activeTab !== 'All') query = query.eq('status', activeTab as string)

  const { data: students, error } = await query
  const list = (students ?? []) as Student[]

  // Group: for each day, find students with a slot on that day (sorted by start time)
  const byDay = DAYS.map((day) => {
    const entries = list
      .flatMap((s) =>
        s.class_schedule
          .filter((slot) => slot.day === day)
          .map((slot) => ({ student: s, slot }))
      )
      .sort((a, b) => a.slot.start.localeCompare(b.slot.start))
    return { day, entries }
  })

  // Students with no schedule at all
  const unscheduled = list.filter((s) => !s.class_schedule || s.class_schedule.length === 0)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Students</h1>
        <Link href="/students/new">
          <Button>+ Add Student</Button>
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'Active' ? '/students' : `/students?status=${encodeURIComponent(tab.value)}`}
          >
            <button className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}>
              {tab.label}
              {activeTab === tab.value && list.length > 0 && ` (${list.length})`}
            </button>
          </Link>
        ))}
      </div>

      {error ? (
        <div className="text-center py-16 text-red-500">
          <p className="text-lg">Failed to load students.</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg">No {activeTab !== 'All' ? activeTab.toLowerCase() : ''} students.</p>
          {activeTab === 'Active' && <p className="text-sm mt-1">Click &quot;Add Student&quot; to get started.</p>}
        </div>
      ) : (
        <div className="space-y-8">
          {byDay.filter(({ entries }) => entries.length > 0).map(({ day, entries }) => (
            <section key={day}>
              <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                {day}
                <span className="text-slate-400 font-normal text-sm">({entries.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {entries.map(({ student, slot }, i) => (
                  <StudentCard key={`${student.id}-${i}`} student={student} slot={slot} />
                ))}
              </div>
            </section>
          ))}

          {unscheduled.length > 0 && (
            <section>
              <h2 className="text-base font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                No Schedule
                <span className="text-slate-400 font-normal text-sm">({unscheduled.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {unscheduled.map((s) => (
                  <StudentCard key={s.id} student={s} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
