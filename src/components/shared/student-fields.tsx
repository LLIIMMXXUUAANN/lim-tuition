import { formatTime } from '@/lib/utils'
import type { ClassSlot } from '@/lib/types'

export const statusBadge: Record<string, string> = {
  'Active': 'bg-green-100 text-green-700',
  'On Hold': 'bg-yellow-100 text-yellow-700',
  'Completed': 'bg-slate-100 text-slate-500',
}

export function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex gap-2">
      <span className="text-slate-500 w-40 flex-shrink-0">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  )
}

export function BlockField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div className="pt-1">
      <p className="text-slate-500 mb-1">{label}</p>
      <p className="text-slate-800 whitespace-pre-wrap">{value}</p>
    </div>
  )
}

export function ScheduleList({ schedule }: { schedule: ClassSlot[] }) {
  if (schedule.length === 0) {
    return <p className="text-slate-400 italic">No schedule set</p>
  }
  return (
    <div className="space-y-1">
      {schedule.map((slot, i) => (
        <p key={i} className="text-slate-700">📅 {slot.day} &nbsp; {formatTime(slot.start)} – {formatTime(slot.end)}</p>
      ))}
    </div>
  )
}
